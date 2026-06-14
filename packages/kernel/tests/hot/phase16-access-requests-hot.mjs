#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const WORKSPACE = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const DIST_INDEX = join(WORKSPACE, "packages/kernel/dist/index.js");
const RENDERER_INDEX = join(WORKSPACE, "packages/renderer/dist/index.html");
const CHROME = "/usr/bin/google-chrome";
const RUN = `phase16-${Date.now().toString(36)}`;
const TOKEN = `${RUN}-token`;
const REAL_HOME = process.env.HOME ?? "";

if (process.env.FMARK_HOT !== "1") {
  console.error("Set FMARK_HOT=1 to run Phase 16 access-request hot checks.");
  process.exit(1);
}

const report = { run: RUN, artifactRoot: null, versions: {}, checks: [] };

function pass(name, detail = {}) {
  report.checks.push({ name, status: "PASS", ...detail });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = execFile(
      command,
      args,
      {
        cwd: options.cwd,
        env: options.env,
        timeout: options.timeoutMs ?? 30_000,
        maxBuffer: 1024 * 1024 * 8,
      },
      (error, stdout, stderr) => {
        const result = {
          command: [command, ...args].join(" "),
          code: error?.code ?? 0,
          stdout: stdout.toString(),
          stderr: stderr.toString(),
        };
        if (error) {
          const wrapped = new Error(
            `${result.command} failed with code ${result.code}: ${result.stderr || result.stdout}`,
          );
          wrapped.result = result;
          reject(wrapped);
          return;
        }
        resolvePromise(result);
      },
    );
    child.stdin?.end();
  });
}

async function waitForHealth(port) {
  const started = Date.now();
  while (Date.now() - started < 20_000) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return;
    } catch {
      // keep polling
    }
    await sleep(100);
  }
  throw new Error("kernel health check timed out");
}

async function startKernel(project, port, env) {
  const child = spawn(
    process.execPath,
    [DIST_INDEX, "--path", project, "--port", String(port), "--password", TOKEN],
    { cwd: project, env, stdio: ["ignore", "pipe", "pipe"] },
  );
  await waitForHealth(port);
  return {
    async stop() {
      child.kill("SIGTERM");
      await new Promise((resolvePromise) => {
        const timer = setTimeout(resolvePromise, 2_000);
        child.once("exit", () => {
          clearTimeout(timer);
          resolvePromise();
        });
      });
      if (child.exitCode === null) child.kill("SIGKILL");
    },
  };
}

async function api(port, method, path, body) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} failed ${res.status}: ${text}`);
  return text.length > 0 ? JSON.parse(text) : {};
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function copyIfExists(from, to) {
  if (!existsSync(from)) return false;
  await mkdir(join(to, ".."), { recursive: true });
  await copyFile(from, to);
  return true;
}

async function makeContext(artifactRoot) {
  const project = join(artifactRoot, "project");
  const home = join(artifactRoot, "home");
  const xdg = join(artifactRoot, "xdg");
  const codexHome = join(home, ".codex");
  const tmuxTmp = join(artifactRoot, "tmux");
  const chromeProfile = join(artifactRoot, "chrome");
  const bin = join(artifactRoot, "bin");
  const markers = join(artifactRoot, "markers");
  const hookDebug = join(artifactRoot, "hook-debug");
  await mkdir(project, { recursive: true });
  await mkdir(home, { recursive: true });
  await mkdir(xdg, { recursive: true });
  await mkdir(codexHome, { recursive: true });
  await mkdir(tmuxTmp, { recursive: true, mode: 0o700 });
  await mkdir(chromeProfile, { recursive: true });
  await mkdir(bin, { recursive: true });
  await mkdir(markers, { recursive: true });
  await mkdir(hookDebug, { recursive: true });

  const fakeNpx = join(bin, "npx");
  await writeFile(
    fakeNpx,
    [
      "#!/bin/sh",
      'if [ "$1" = "-y" ] && [ "$2" = "f-mark" ]; then',
      "  shift 2",
      '  if [ -n "$FMARK_HOOK_DEBUG_DIR" ]; then',
      '    mkdir -p "$FMARK_HOOK_DEBUG_DIR"',
      '    stamp="$(date +%s%N)-$$"',
      '    stdin_file="$FMARK_HOOK_DEBUG_DIR/$stamp.stdin.json"',
      '    stdout_file="$FMARK_HOOK_DEBUG_DIR/$stamp.stdout.txt"',
      '    stderr_file="$FMARK_HOOK_DEBUG_DIR/$stamp.stderr.txt"',
      '    env_file="$FMARK_HOOK_DEBUG_DIR/$stamp.env.txt"',
      '    cat > "$stdin_file"',
      '    env | sort > "$env_file"',
      `    ${JSON.stringify(process.execPath)} ${JSON.stringify(DIST_INDEX)} "$@" < "$stdin_file" > "$stdout_file" 2> "$stderr_file"`,
      '    code="$?"',
      '    cat "$stdout_file"',
      '    cat "$stderr_file" >&2',
      '    exit "$code"',
      "  fi",
      `  exec ${JSON.stringify(process.execPath)} ${JSON.stringify(DIST_INDEX)} "$@"`,
      "fi",
      "exec /usr/bin/env npx \"$@\"",
      "",
    ].join("\n"),
  );
  await chmod(fakeNpx, 0o755);

  const env = {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: xdg,
    CODEX_HOME: codexHome,
    TMUX_TMPDIR: tmuxTmp,
    PATH: `${bin}:${process.env.PATH ?? ""}`,
    FMARK_HOOK_DEBUG_DIR: hookDebug,
    NO_COLOR: "1",
  };

  await copyIfExists(join(REAL_HOME, ".codex/auth.json"), join(codexHome, "auth.json"));
  await copyIfExists(join(REAL_HOME, ".codex/installation_id"), join(codexHome, "installation_id"));

  return {
    project,
    home,
    xdg,
    codexHome,
    tmuxTmp,
    chromeProfile,
    bin,
    markers,
    hookDebug,
    env,
  };
}

async function writeHookConfigs(ctx, userId) {
  const hookCommand = (participantId, kind = "assistant") =>
    [
      process.execPath,
      DIST_INDEX,
      "hook",
      "auto-stream",
      ...(participantId !== undefined ? [participantId] : []),
      ...(kind !== "assistant" ? ["--kind", kind] : []),
      "--fmark-hook-version",
      "managed-only-v2",
    ].join(" ");
  const genericHookCommand = hookCommand(undefined);
  const codexAgentHookCommand = hookCommand("ag-p16-codex");
  const codexUserHookCommand = hookCommand(userId, "user");
  const claudeSettings = {
    hooks: {
      Stop: [
        {
          hooks: [
            { type: "command", command: genericHookCommand },
          ],
        },
      ],
      PermissionRequest: [
        {
          matcher: "Bash|Edit|Write|MultiEdit|Read|WebFetch|WebSearch",
          hooks: [
            { type: "command", command: genericHookCommand },
          ],
        },
      ],
      /* `managed-only-v2` requires PostToolUse for detectClaudeHooks to
         report `installed`. */
      PostToolUse: [
        {
          hooks: [
            { type: "command", command: genericHookCommand },
          ],
        },
      ],
    },
  };
  await mkdir(join(ctx.project, ".claude"), { recursive: true });
  await writeFile(
    join(ctx.project, ".claude", "settings.json"),
    `${JSON.stringify(claudeSettings, null, 2)}\n`,
  );

  await writeFile(
    join(ctx.codexHome, "config.toml"),
    [
      'model = "gpt-5.5"',
      'model_reasoning_effort = "low"',
      "[features]",
      "hooks = true",
      `[projects.${JSON.stringify(ctx.project)}]`,
      'trust_level = "trusted"',
      "",
    ].join("\n"),
  );
  const codexHooks = {
    hooks: {
      Stop: [
        {
          hooks: [
            {
              type: "command",
              command: codexAgentHookCommand,
              timeout: 30,
            },
          ],
        },
      ],
      UserPromptSubmit: [
        {
          hooks: [
            {
              type: "command",
              command: codexUserHookCommand,
              timeout: 10,
            },
          ],
        },
      ],
      PermissionRequest: [
        {
          matcher: "Bash",
          hooks: [
            {
              type: "command",
              command: codexAgentHookCommand,
              timeout: 300,
              statusMessage: "Waiting for F-Mark access response",
            },
          ],
        },
      ],
    },
  };
  await writeFile(join(ctx.codexHome, "hooks.json"), `${JSON.stringify(codexHooks, null, 2)}\n`);

  const geminiSettings = {
    hooksConfig: { enabled: true },
    hooks: {
      Notification: [
        {
          matcher: "*",
          hooks: [
            {
              name: "f-mark-access-stream",
              type: "command",
              command: genericHookCommand,
              timeout: 300000,
            },
          ],
        },
      ],
    },
  };
  await mkdir(join(ctx.project, ".gemini"), { recursive: true });
  await writeFile(
    join(ctx.project, ".gemini", "settings.json"),
    `${JSON.stringify(geminiSettings, null, 2)}\n`,
  );
}

async function createSession(port, project) {
  const session = await api(port, "POST", "/sessions", {
    slug: `${RUN}-access`,
    path: project,
  });
  return session.id;
}

async function activatePath(port, project) {
  await api(port, "POST", "/paths/active", { path: project });
}

async function defaultUserId(port) {
  const roster = await api(port, "GET", "/participants");
  const found = Object.entries(roster.participants ?? {}).find(
    ([, participant]) => participant.kind === "user",
  );
  assert(found !== undefined, "default user participant not found");
  return found[0];
}

async function registerLinkedAgent(port, sessionId, participantId, runtimeId, name) {
  await api(port, "POST", "/participants/register", {
    kind: "agent",
    name,
    suggested_id: participantId,
    runtime_id: runtimeId,
  });
  await api(port, "POST", `/agents/${encodeURIComponent(participantId)}/link`, {
    session_id: sessionId,
  });
}

function projectRootHash(root) {
  return createHash("sha256").update(root).digest("hex").slice(0, 8);
}

function fmarkAgentSessionName(root, participantId) {
  const slug =
    basename(root)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-+/g, "-") || "fmark";
  return `fmark-${slug}-${projectRootHash(root)}-ag-${participantId}`;
}

async function writeManagedState(ctx, participantId, runtimeId, sessionId, tmuxSession) {
  const dir = join(ctx.project, ".f-mark", "agents", participantId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "tmux-session"), tmuxSession, "utf8");
  await writeFile(join(dir, "runtime"), runtimeId, "utf8");
  await writeFile(join(dir, "active-session"), sessionId, "utf8");
  await writeFile(
    join(dir, "state.json"),
    `${JSON.stringify({
      paused: false,
      activity_state: "idle",
      access_mode: "unknown",
      updated_at: new Date().toISOString(),
    }, null, 2)}\n`,
  );
  await writeFile(
    join(dir, "runtime-session.json"),
    `${JSON.stringify({
      desired_name: sessionId,
      native_name_applied: runtimeId === "claude",
    }, null, 2)}\n`,
  );
}

function envArgs(env) {
  const args = [];
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    args.push("-e", `${key}=${value}`);
  }
  return args;
}

async function startVendorSession(ctx, input) {
  const sessionName = fmarkAgentSessionName(ctx.project, input.participantId);
  try {
    await run("tmux", ["kill-session", "-t", sessionName], {
      cwd: ctx.project,
      env: ctx.env,
      timeoutMs: 5_000,
    });
  } catch {
    // previous session absent
  }
  const resultEnv = {
    PATH: ctx.env.PATH,
    TMUX_TMPDIR: ctx.tmuxTmp,
    F_MARK_PATH: ctx.project,
    F_MARK_AGENT_ID: input.participantId,
    F_MARK_SESSION_ID: input.sessionId,
    F_MARK_RUNTIME_ID: input.runtimeId,
    NO_COLOR: "1",
    ...(input.extraEnv ?? {}),
  };
  await run(
    "tmux",
    [
      "new-session",
      "-d",
      "-s",
      sessionName,
      ...envArgs(resultEnv),
      "-c",
      ctx.project,
      "--",
      input.executable,
      ...input.args,
    ],
    { cwd: ctx.project, env: ctx.env, timeoutMs: 10_000 },
  );
  await run("tmux", ["set-option", "-t", sessionName, "@fmark-project", ctx.project], {
    cwd: ctx.project,
    env: ctx.env,
  });
  await run("tmux", ["set-option", "-t", sessionName, "@fmark-participant", input.participantId], {
    cwd: ctx.project,
    env: ctx.env,
  });
  await writeManagedState(
    ctx,
    input.participantId,
    input.runtimeId,
    input.sessionId,
    sessionName,
  );
  return sessionName;
}

async function killTmux(ctx, sessionName) {
  try {
    await run("tmux", ["kill-session", "-t", sessionName], {
      cwd: ctx.project,
      env: ctx.env,
      timeoutMs: 5_000,
    });
  } catch {
    // already gone
  }
}

async function captureTmux(ctx, sessionName) {
  try {
    const result = await run(
      "tmux",
      ["capture-pane", "-t", sessionName, "-p", "-e", "-J", "-S", "-2000"],
      { cwd: ctx.project, env: ctx.env, timeoutMs: 5_000 },
    );
    return result.stdout;
  } catch (err) {
    return `capture failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function maybeTrustCodexHook(ctx, sessionName) {
  const pane = await captureTmux(ctx, sessionName);
  const lower = pane.toLowerCase();
  if (
    lower.includes("trust") &&
    lower.includes("hook") &&
    (lower.includes("approve") ||
      lower.includes("allow") ||
      lower.includes("trust all"))
  ) {
    await run("tmux", ["send-keys", "-t", sessionName, "2", "C-m"], {
      cwd: ctx.project,
      env: ctx.env,
      timeoutMs: 5_000,
    });
    await sleep(500);
  }
}

async function maybeTrustClaudeWorkspace(ctx, sessionName) {
  const pane = await captureTmux(ctx, sessionName);
  const lower = pane.toLowerCase();
  if (
    lower.includes("quick safety check") &&
    lower.includes("yes, i trust this folder")
  ) {
    await run("tmux", ["send-keys", "-t", sessionName, "C-m"], {
      cwd: ctx.project,
      env: ctx.env,
      timeoutMs: 5_000,
    });
    await sleep(500);
  }
}

async function sendPrompt(ctx, sessionName, prompt) {
  await run("tmux", ["set-buffer", "-b", "fmark-hot-prompt", prompt], {
    cwd: ctx.project,
    env: ctx.env,
    timeoutMs: 5_000,
  });
  await run("tmux", ["paste-buffer", "-b", "fmark-hot-prompt", "-t", sessionName], {
    cwd: ctx.project,
    env: ctx.env,
    timeoutMs: 5_000,
  });
  await run("tmux", ["send-keys", "-t", sessionName, "C-m"], {
    cwd: ctx.project,
    env: ctx.env,
    timeoutMs: 5_000,
  });
  await sleep(750);
  await run("tmux", ["send-keys", "-t", sessionName, "Enter"], {
    cwd: ctx.project,
    env: ctx.env,
    timeoutMs: 5_000,
  });
}

async function waitForClaudeReadyAndSend(ctx, sessionName, prompt) {
  const started = Date.now();
  while (Date.now() - started < 45_000) {
    await maybeTrustClaudeWorkspace(ctx, sessionName);
    const pane = await captureTmux(ctx, sessionName);
    const lower = pane.toLowerCase();
    if (lower.includes("quick safety check")) {
      await sleep(500);
      continue;
    }
    if (
      lower.includes("try \"write a test") ||
      lower.includes("welcome back") ||
      lower.includes("claude code")
    ) {
      await sendPrompt(ctx, sessionName, prompt);
      return;
    }
    await sleep(500);
  }
  throw new Error(`Claude prompt box was not ready: ${(await captureTmux(ctx, sessionName)).slice(-2000)}`);
}

async function maybeConfirmClaudePreToolPrompt(ctx, sessionName, markerPath) {
  const pane = await captureTmux(ctx, sessionName);
  const lower = pane.toLowerCase();
  const marker = basename(markerPath);
  if (
    !pane.includes(marker) ||
    !(
      lower.includes("do you want me to proceed") ||
      lower.includes("without checking in first") ||
      lower.includes("can't run that command without checking")
    )
  ) {
    return false;
  }
  await sendPrompt(ctx, sessionName, `Yes, proceed with that exact touch command: ${markerPath}`);
  return true;
}

async function listEvents(port, sessionId) {
  const body = await api(port, "GET", `/sessions/${encodeURIComponent(sessionId)}/events`);
  return body.events ?? body;
}

async function waitForAccessRequest(port, sessionId, participantId, marker, timeoutMs = 180_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const events = await listEvents(port, sessionId);
    const found = events.find(
      (event) =>
        event.kind === "access-request" &&
        event.participant_id === participantId &&
        JSON.stringify(event.payload).includes(marker),
    );
    if (found !== undefined) return found;
    await sleep(500);
  }
  throw new Error(`timed out waiting for access request ${marker}`);
}

async function waitForAccessResponse(port, sessionId, requestId, status, timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const events = await listEvents(port, sessionId);
    const found = events.find(
      (event) =>
        event.kind === "access-response" &&
        event.payload.request_id === requestId &&
        (status === undefined || event.payload.status === status),
    );
    if (found !== undefined) return found;
    await sleep(250);
  }
  throw new Error(`timed out waiting for access response ${requestId}`);
}

async function waitForFile(path, timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (existsSync(path)) return;
    await sleep(250);
  }
  throw new Error(`timed out waiting for file ${path}`);
}

async function assertNoFile(path, settleMs = 2_000) {
  await sleep(settleMs);
  assert(!existsSync(path), `file should not exist: ${path}`);
}

async function waitForPendingCount(port, sessionId, participantId, minCount, timeoutMs = 15_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const status = await api(
      port,
      "GET",
      `/managed-agents/status?session_id=${encodeURIComponent(sessionId)}`,
    );
    const agent = (status.agents ?? []).find((item) => item.participant_id === participantId);
    if ((agent?.pending_access_count ?? 0) >= minCount) return agent;
    await sleep(250);
  }
  throw new Error(`timed out waiting for pending access count ${participantId} >= ${minCount}`);
}

async function waitForPendingCleared(port, sessionId, participantId, timeoutMs = 15_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const status = await api(
      port,
      "GET",
      `/managed-agents/status?session_id=${encodeURIComponent(sessionId)}`,
    );
    const agent = (status.agents ?? []).find((item) => item.participant_id === participantId);
    if ((agent?.pending_access_count ?? 0) === 0) return agent;
    await sleep(250);
  }
  throw new Error(`timed out waiting for pending access count to clear for ${participantId}`);
}

async function startChrome(ctx, debugPort) {
  const child = spawn(
    CHROME,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${ctx.chromeProfile}`,
      "about:blank",
    ],
    { env: ctx.env, stdio: ["ignore", "pipe", "pipe"] },
  );
  const started = Date.now();
  while (Date.now() - started < 15_000) {
    try {
      const res = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      if (res.ok) {
        const pages = await res.json();
        const page = Array.isArray(pages)
          ? pages.find((entry) => entry.type === "page" && entry.webSocketDebuggerUrl)
          : null;
        if (page?.webSocketDebuggerUrl) return { child, wsUrl: page.webSocketDebuggerUrl };
      }
    } catch {
      // keep polling
    }
    await sleep(100);
  }
  child.kill("SIGTERM");
  throw new Error("Chrome DevTools endpoint timed out");
}

class CdpPage {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
  }

  async open() {
    await new Promise((resolvePromise, reject) => {
      this.ws.once("open", resolvePromise);
      this.ws.once("error", reject);
    });
    this.ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const waiter = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) waiter.reject(new Error(JSON.stringify(msg.error)));
        else waiter.resolve(msg.result);
      }
    });
    await this.send("Page.enable");
    await this.send("Runtime.enable");
  }

  send(method, params = {}) {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject });
      this.ws.send(payload);
    });
  }

  async eval(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      const detail =
        result.exceptionDetails.exception?.description ??
        result.exceptionDetails.text ??
        "Runtime.evaluate failed";
      throw new Error(detail);
    }
    return result.result?.value;
  }

  async waitFor(expression, timeoutMs = 10_000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const value = await this.eval(expression);
      if (value) return value;
      await sleep(100);
    }
    throw new Error(`timed out waiting for ${expression}`);
  }

  close() {
    this.ws.close();
  }
}

async function clickUiDecision(page, marker, decision) {
  const title = decision === "approve" ? "Approve" : "Deny";
  await page.waitFor(
    `document.body.textContent.includes(${JSON.stringify(marker)})`,
    20_000,
  );
  const clicked = await page.eval(`
(() => {
  const marker = ${JSON.stringify(marker)};
  const title = ${JSON.stringify(title)};
  const cards = [...document.querySelectorAll('.access-request-card')];
  const card = cards.find((item) => item.textContent && item.textContent.includes(marker));
  if (!card) return false;
  const button = [...card.querySelectorAll('button')]
    .find((item) => item.title === title || item.getAttribute('aria-label')?.startsWith(title));
  if (!button || button.disabled) return false;
  button.click();
  return true;
})()
`);
  assert(clicked, `failed to click ${title} for ${marker}`);
}

function commandPrompt(markerPath) {
  return `Run exactly this shell command now with the shell tool: touch ${markerPath}`;
}

async function runVendorScenario(ctx, port, page, sessionId, input) {
  const markerPath = join(ctx.markers, `${input.vendor}-${input.decision}-${Date.now()}`);
  const marker = basename(markerPath);
  const prompt = commandPrompt(markerPath);
  let sessionName;
  if (input.vendor === "claude") {
    sessionName = await startVendorSession(ctx, {
      participantId: input.participantId,
      runtimeId: "claude",
      sessionId,
      executable: "claude",
      args: [
        "--settings",
        join(ctx.project, ".claude", "settings.json"),
        "--permission-mode",
        "default",
        "--tools",
        "Bash",
      ],
      extraEnv: {
        HOME: REAL_HOME,
        ...(input.timeoutMs !== undefined
          ? { F_MARK_ACCESS_REQUEST_TIMEOUT_MS: String(input.timeoutMs) }
          : {}),
      },
    });
    await waitForClaudeReadyAndSend(ctx, sessionName, prompt);
  } else if (input.vendor === "codex") {
    sessionName = await startVendorSession(ctx, {
      participantId: input.participantId,
      runtimeId: "codex",
      sessionId,
      executable: "codex",
      args: [
        "--no-alt-screen",
        "-C",
        ctx.project,
        "-a",
        "untrusted",
        "-s",
        "workspace-write",
        prompt,
      ],
      extraEnv: {
        HOME: ctx.home,
        CODEX_HOME: ctx.codexHome,
        ...(input.timeoutMs !== undefined
          ? { F_MARK_ACCESS_REQUEST_TIMEOUT_MS: String(input.timeoutMs) }
          : {}),
      },
    });
  } else {
    sessionName = await startVendorSession(ctx, {
      participantId: input.participantId,
      runtimeId: "gemini",
      sessionId,
      executable: "gemini",
      args: [
        "--skip-trust",
        "--approval-mode",
        "default",
        "-i",
        prompt,
      ],
      extraEnv: {
        HOME: REAL_HOME,
        GEMINI_CLI_TRUST_WORKSPACE: "true",
      },
    });
  }

  const started = Date.now();
  let request = null;
  let claudePreToolConfirmed = false;
  while (Date.now() - started < 180_000) {
    if (input.vendor === "claude") await maybeTrustClaudeWorkspace(ctx, sessionName);
    if (input.vendor === "codex") await maybeTrustCodexHook(ctx, sessionName);
    const events = await listEvents(port, sessionId);
    request = events.find(
      (event) =>
        event.kind === "access-request" &&
        event.participant_id === input.participantId &&
        JSON.stringify(event.payload).includes(marker),
    );
    if (request !== undefined) break;
    if (input.vendor === "claude" && !claudePreToolConfirmed) {
      claudePreToolConfirmed = await maybeConfirmClaudePreToolPrompt(ctx, sessionName, markerPath);
    }
    await sleep(500);
  }
  if (request === null || request === undefined) {
    const pane = await captureTmux(ctx, sessionName);
    throw new Error(`no access request for ${input.vendor} ${input.decision}: ${pane.slice(-2000)}`);
  }

  assert(
    request.payload.response_channel === (input.vendor === "gemini" ? "terminal" : "hook"),
    `${input.vendor} response channel was ${request.payload.response_channel}`,
  );
  await waitForPendingCount(port, sessionId, input.participantId, 1);

  if (input.decision === "timeout") {
    const response = await waitForAccessResponse(
      port,
      sessionId,
      request.payload.request_id,
      "expired",
      30_000,
    );
    await waitForPendingCleared(port, sessionId, input.participantId);
    await assertNoFile(markerPath);
    const pane = await captureTmux(ctx, sessionName);
    await killTmux(ctx, sessionName);
    pass(`${input.vendor} real session access request expires honestly`, {
      request: request.filename,
      response: response.filename,
      participantId: input.participantId,
      tmuxSession: sessionName,
      paneTail: pane.slice(-1200),
    });
    return;
  }

  if (input.disconnectBeforeRespond) {
    await killTmux(ctx, sessionName);
  }

  await clickUiDecision(page, marker, input.decision);
  const expectedStatus = input.disconnectBeforeRespond
    ? "expired"
    : input.decision === "approve"
      ? "approved"
      : "denied";
  const response = await waitForAccessResponse(
    port,
    sessionId,
    request.payload.request_id,
    expectedStatus,
    60_000,
  );
  await waitForPendingCleared(port, sessionId, input.participantId);

  if (input.decision === "approve" && !input.disconnectBeforeRespond) {
    await waitForFile(markerPath);
  } else {
    await assertNoFile(markerPath);
  }

  const pane = await captureTmux(ctx, sessionName);
  await killTmux(ctx, sessionName);
  pass(
    `${input.vendor} real session ${input.decision}${input.disconnectBeforeRespond ? " disconnected" : ""}`,
    {
      request: request.filename,
      response: response.filename,
      participantId: input.participantId,
      tmuxSession: sessionName,
      delivered: response.payload.delivered,
      delivery: response.payload.delivery,
      responseStatus: response.payload.status,
      markerPath,
      paneTail: pane.slice(-1200),
    },
  );
}

async function assertHookStatus(port, runtimeId, participantId, userId) {
  const q = new URLSearchParams({ runtime_id: runtimeId });
  if (participantId !== undefined) q.set("participant_id", participantId);
  if (userId !== undefined) q.set("user_participant_id", userId);
  const status = await api(port, "GET", `/managed-agents/hook-install-status?${q.toString()}`);
  assert(status.installed === true, `${runtimeId} hook status was not installed`);
  pass(`${runtimeId} hook-install status detects access hook`, {
    configPath: status.configPath,
    detected: status.detectedEntries,
  });
}

async function main() {
  let artifactRoot = null;
  let kernel = null;
  let chrome = null;
  let page = null;
  try {
    assert(existsSync(DIST_INDEX), "kernel dist is missing; run pnpm -F f-mark build");
    assert(existsSync(RENDERER_INDEX), "renderer dist is missing; run pnpm -F @f-mark/renderer build");
    artifactRoot = await mkdtemp(join(tmpdir(), "fmark-mcp-phase16-hot-"));
    report.artifactRoot = artifactRoot;
    const ctx = await makeContext(artifactRoot);
    const port = 12_100 + Math.floor(Math.random() * 300);
    const debugPort = 12_500 + Math.floor(Math.random() * 300);
    kernel = await startKernel(ctx.project, port, ctx.env);
    await activatePath(port, ctx.project);
    const sessionId = await createSession(port, ctx.project);
    const userId = await defaultUserId(port);
    await writeHookConfigs(ctx, userId);

    report.versions.claude = (await run("claude", ["--version"], { env: ctx.env })).stdout.trim();
    report.versions.codex = (await run("codex", ["--version"], { env: ctx.env })).stdout.trim();
    report.versions.gemini = (await run("gemini", ["--version"], { env: ctx.env })).stdout.trim();

    await registerLinkedAgent(port, sessionId, "ag-p16-claude", "claude", "Phase16 Claude");
    await registerLinkedAgent(port, sessionId, "ag-p16-codex", "codex", "Phase16 Codex");
    await registerLinkedAgent(port, sessionId, "ag-p16-gemini", "gemini", "Phase16 Gemini");

    await assertHookStatus(port, "claude", undefined, userId);
    await assertHookStatus(port, "codex", "ag-p16-codex", userId);
    await assertHookStatus(port, "gemini", undefined, userId);

    chrome = await startChrome(ctx, debugPort);
    page = new CdpPage(chrome.wsUrl);
    await page.open();
    await page.send("Page.navigate", {
      url: `http://127.0.0.1:${port}/?token=${encodeURIComponent(TOKEN)}`,
    });
    await page.waitFor(
      `Boolean(document.body) && document.body.textContent.includes(${JSON.stringify(`${RUN}-access`)})`,
      20_000,
    );
    await page.waitFor("Boolean(document.querySelector('.compose-box textarea'))");
    pass("real browser UI loaded hot access session", { sessionId });

    await runVendorScenario(ctx, port, page, sessionId, {
      vendor: "claude",
      participantId: "ag-p16-claude",
      decision: "approve",
    });
    await runVendorScenario(ctx, port, page, sessionId, {
      vendor: "claude",
      participantId: "ag-p16-claude",
      decision: "deny",
    });
    await runVendorScenario(ctx, port, page, sessionId, {
      vendor: "codex",
      participantId: "ag-p16-codex",
      decision: "approve",
    });
    await runVendorScenario(ctx, port, page, sessionId, {
      vendor: "codex",
      participantId: "ag-p16-codex",
      decision: "deny",
    });
    await runVendorScenario(ctx, port, page, sessionId, {
      vendor: "gemini",
      participantId: "ag-p16-gemini",
      decision: "approve",
    });
    await runVendorScenario(ctx, port, page, sessionId, {
      vendor: "gemini",
      participantId: "ag-p16-gemini",
      decision: "deny",
    });
    await runVendorScenario(ctx, port, page, sessionId, {
      vendor: "claude",
      participantId: "ag-p16-claude",
      decision: "timeout",
      timeoutMs: 2500,
    });
    await runVendorScenario(ctx, port, page, sessionId, {
      vendor: "codex",
      participantId: "ag-p16-codex",
      decision: "timeout",
      timeoutMs: 2500,
    });
    await runVendorScenario(ctx, port, page, sessionId, {
      vendor: "gemini",
      participantId: "ag-p16-gemini",
      decision: "approve",
      disconnectBeforeRespond: true,
    });

    pass("Phase 16 live matrix covered all three vendors", {
      sessionId,
      vendors: ["claude", "codex", "gemini"],
      scenarios: ["approve", "deny", "hook-timeout", "terminal-disconnect-expired"],
    });

    await writeFile(join(artifactRoot, "report.json"), JSON.stringify(report, null, 2));
    console.log(`HOT_TEST_REPORT ${join(artifactRoot, "report.json")}`);
    console.log(JSON.stringify({ run: RUN, artifactRoot, passes: report.checks.length }, null, 2));
  } catch (error) {
    if (artifactRoot === null) artifactRoot = await mkdtemp(join(tmpdir(), "fmark-mcp-phase16-hot-"));
    if (page !== null) {
      try {
        const debug = await page.eval(`JSON.stringify({
          url: location.href,
          title: document.title,
          text: document.body ? document.body.innerText : "",
          html: document.documentElement ? document.documentElement.outerHTML.slice(0, 6000) : ""
        }, null, 2)`);
        await writeFile(join(artifactRoot, "page-debug.json"), debug);
      } catch {
        // best-effort diagnostics only
      }
    }
    report.checks.push({
      name: "Phase 16 access request hot runner",
      status: "FAIL",
      error: error instanceof Error ? error.message : String(error),
    });
    await writeFile(join(artifactRoot, "report.failed.json"), JSON.stringify(report, null, 2));
    console.error(`HOT_TEST_FAILED_REPORT ${join(artifactRoot, "report.failed.json")}`);
    throw error;
  } finally {
    if (page !== null) page.close();
    if (chrome !== null) {
      chrome.child.kill("SIGTERM");
      await sleep(500);
      if (chrome.child.exitCode === null) chrome.child.kill("SIGKILL");
    }
    if (kernel !== null) await kernel.stop();
    if (artifactRoot !== null) {
      try {
        await run("tmux", ["kill-server"], {
          cwd: join(artifactRoot, "project"),
          env: { ...process.env, TMUX_TMPDIR: join(artifactRoot, "tmux") },
          timeoutMs: 5_000,
        });
      } catch {
        // isolated tmux server may already be gone
      }
    }
    if (artifactRoot !== null && process.env.FMARK_HOT_KEEP !== "1") {
      const reportPath = existsSync(join(artifactRoot, "report.json"))
        ? join(artifactRoot, "report.json")
        : join(artifactRoot, "report.failed.json");
      const debugPath = join(artifactRoot, "page-debug.json");
      const saved = existsSync(reportPath) ? await readFile(reportPath, "utf8") : null;
      const debug = existsSync(debugPath) ? await readFile(debugPath, "utf8") : null;
      for (const entry of await readdir(artifactRoot)) {
        if (entry === "report.json" || entry === "report.failed.json" || entry === "page-debug.json") continue;
        await rm(join(artifactRoot, entry), { recursive: true, force: true });
      }
      if (saved !== null) await writeFile(reportPath, saved);
      if (debug !== null) await writeFile(debugPath, debug);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
