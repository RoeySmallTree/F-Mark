#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import {
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

const WORKSPACE = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const DIST_INDEX = join(WORKSPACE, "packages/kernel/dist/index.js");
const RUN = `phase18v-${Date.now().toString(36)}`;
const TOKEN = `${RUN}-token`;
const REAL_HOME = process.env.HOME ?? "";

if (process.env.FMARK_HOT !== "1") {
  console.error("Set FMARK_HOT=1 to run Phase 18 vendor fork hot checks.");
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
        timeout: options.timeoutMs ?? 40_000,
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

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
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
  await mkdir(project, { recursive: true });
  await mkdir(home, { recursive: true });
  await mkdir(xdg, { recursive: true });
  await mkdir(codexHome, { recursive: true });
  await mkdir(tmuxTmp, { recursive: true, mode: 0o700 });
  await copyIfExists(join(REAL_HOME, ".codex/auth.json"), join(codexHome, "auth.json"));
  await copyIfExists(join(REAL_HOME, ".codex/installation_id"), join(codexHome, "installation_id"));
  await prepareGeminiHome({ home, project });
  return {
    project,
    home,
    xdg,
    codexHome,
    tmuxTmp,
    env: {
      ...process.env,
      HOME: home,
      XDG_CONFIG_HOME: xdg,
      CODEX_HOME: codexHome,
      TMUX_TMPDIR: tmuxTmp,
      NO_COLOR: "1",
    },
  };
}

async function prepareGeminiHome(ctx) {
  const geminiHome = join(ctx.home, ".gemini");
  await mkdir(geminiHome, { recursive: true });
  for (const file of ["settings.json", "oauth_creds.json", "google_accounts.json", "installation_id"]) {
    await copyIfExists(join(REAL_HOME, ".gemini", file), join(geminiHome, file));
  }
  await writeFile(
    join(geminiHome, "trustedFolders.json"),
    JSON.stringify({ [ctx.project]: "TRUST_FOLDER" }, null, 2),
  );
}

async function createSession(port, slug, project) {
  return api(port, "POST", "/sessions", { slug, path: project });
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

function envArgs(env) {
  const args = [];
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    args.push("-e", `${key}=${value}`);
  }
  return args;
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

async function startVendorSession(ctx, input) {
  const sessionName = fmarkAgentSessionName(ctx.project, input.participantId);
  try {
    await run("tmux", ["kill-session", "-t", sessionName], {
      cwd: ctx.project,
      env: ctx.env,
      timeoutMs: 5_000,
    });
  } catch {
    // absent
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

async function captureTmux(ctx, sessionName) {
  const result = await run(
    "tmux",
    ["capture-pane", "-t", sessionName, "-p", "-e", "-J", "-S", "-2000"],
    { cwd: ctx.project, env: ctx.env, timeoutMs: 5_000 },
  );
  return result.stdout;
}

async function waitForPaneText(ctx, sessionName, needles, timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const pane = await captureTmux(ctx, sessionName).catch(() => "");
    if (needles.every((needle) => pane.includes(needle))) return pane;
    await sleep(500);
  }
  throw new Error(`timed out waiting for pane ${sessionName} to contain ${needles.join(", ")}`);
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

async function writeClaudeMcpConfig(path, project, agent) {
  await writeFile(
    path,
    JSON.stringify(
      {
        mcpServers: {
          fmark: {
            type: "stdio",
            command: process.execPath,
            args: [DIST_INDEX, "mcp", "--path", project],
            env: {
              F_MARK_PATH: project,
              F_MARK_AGENT_ID: agent.participantId,
              F_MARK_SESSION_ID: agent.sourceSessionId,
              F_MARK_RUNTIME_ID: agent.runtimeId,
            },
          },
        },
      },
      null,
      2,
    ),
  );
}

async function configureCodexMcp(ctx, agent) {
  await writeFile(
    join(ctx.codexHome, "config.toml"),
    [
      "[features]",
      "hooks = true",
      `[projects.${JSON.stringify(ctx.project)}]`,
      'trust_level = "trusted"',
      "",
      "[mcp_servers.fmark]",
      `command = ${JSON.stringify(process.execPath)}`,
      `args = [${[DIST_INDEX, "mcp", "--path", ctx.project].map((arg) => JSON.stringify(arg)).join(", ")}]`,
      "",
      "[mcp_servers.fmark.env]",
      `F_MARK_PATH = ${JSON.stringify(ctx.project)}`,
      `F_MARK_AGENT_ID = ${JSON.stringify(agent.participantId)}`,
      `F_MARK_SESSION_ID = ${JSON.stringify(agent.sourceSessionId)}`,
      `F_MARK_RUNTIME_ID = ${JSON.stringify(agent.runtimeId)}`,
      "",
    ].join("\n"),
  );
}

async function configureGeminiMcp(ctx, agent) {
  await run(
    "gemini",
    [
      "mcp",
      "add",
      "--scope",
      "project",
      "--transport",
      "stdio",
      "--trust",
      "-e",
      `F_MARK_PATH=${ctx.project}`,
      "-e",
      `F_MARK_AGENT_ID=${agent.participantId}`,
      "-e",
      `F_MARK_SESSION_ID=${agent.sourceSessionId}`,
      "-e",
      `F_MARK_RUNTIME_ID=${agent.runtimeId}`,
      "fmark",
      process.execPath,
      DIST_INDEX,
      "mcp",
      "--path",
      ctx.project,
    ],
    { cwd: ctx.project, env: ctx.env, timeoutMs: 30_000 },
  );
}

function vendorForkPrompt(vendor, marker) {
  return [
    `You are hot-checking F-Mark fork context for ${vendor}.`,
    "Use MCP server fmark only. Do not use shell, files, REST, or curl.",
    `Call fmark_post_prose with arguments exactly {"content":"${marker}"}.`,
    "Then call fmark_end_turn with arguments exactly {}.",
    "Do not pass session_id or participant_id.",
    "After the MCP calls succeed, reply with exactly DONE.",
  ].join(" ");
}

async function waitForMarker(port, sessionId, marker, timeoutMs = 90_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const body = await api(port, "GET", `/sessions/${encodeURIComponent(sessionId)}/events`);
    if (JSON.stringify(body).includes(marker)) return body;
    await sleep(500);
  }
  throw new Error(`timed out waiting for ${marker} in ${sessionId}`);
}

async function assertMarkerAbsent(port, sessionId, marker) {
  const body = await api(port, "GET", `/sessions/${encodeURIComponent(sessionId)}/events`);
  assert(!JSON.stringify(body).includes(marker), `${marker} unexpectedly landed in ${sessionId}`);
}

async function runVendorMcpWrite(ctx, port, vendor, agent, forkSessionId) {
  const marker = `FMARK_${RUN}_${vendor.toUpperCase()}_FORK_CTX`;
  let result;
  if (vendor === "claude") {
    const config = join(ctx.project, `claude-mcp-${vendor}.json`);
    await writeClaudeMcpConfig(config, ctx.project, agent);
    result = await run(
      "claude",
      [
        "--print",
        "--output-format",
        "text",
        "--no-session-persistence",
        "--mcp-config",
        config,
        "--strict-mcp-config",
        "--permission-mode",
        "bypassPermissions",
        "--allowedTools",
        "mcp__fmark__fmark_post_prose,mcp__fmark__fmark_end_turn",
        "--max-budget-usd",
        "1.00",
        vendorForkPrompt(vendor, marker),
      ],
      { cwd: ctx.project, env: { ...ctx.env, HOME: REAL_HOME }, timeoutMs: 180_000 },
    );
  } else if (vendor === "codex") {
    await configureCodexMcp(ctx, agent);
    result = await run(
      "codex",
      [
        "exec",
        "--json",
        "-C",
        ctx.project,
        "--skip-git-repo-check",
        "--dangerously-bypass-approvals-and-sandbox",
        vendorForkPrompt(vendor, marker),
      ],
      { cwd: ctx.project, env: ctx.env, timeoutMs: 240_000 },
    );
  } else {
    await configureGeminiMcp(ctx, agent);
    result = await run(
      "gemini",
      [
        "--skip-trust",
        "--approval-mode",
        "yolo",
        "--allowed-mcp-server-names",
        "fmark",
        "--output-format",
        "text",
        "--prompt",
        vendorForkPrompt(vendor, marker),
      ],
      { cwd: ctx.project, env: ctx.env, timeoutMs: 240_000 },
    );
  }
  await waitForMarker(port, forkSessionId, marker);
  await assertMarkerAbsent(port, agent.sourceSessionId, marker);
  pass(`${vendor} real model MCP write followed fork active-session`, {
    sourceSessionId: agent.sourceSessionId,
    forkSessionId,
    participantId: agent.participantId,
    stdout: result.stdout.slice(-1200),
  });
}

async function checkNativeHelp(ctx) {
  const claude = await run("claude", ["--help"], { cwd: ctx.project, env: ctx.env });
  const codex = await run("codex", ["fork", "--help"], { cwd: ctx.project, env: ctx.env });
  const gemini = await run("gemini", ["--help"], { cwd: ctx.project, env: ctx.env });
  assert(claude.stdout.includes("--fork-session"), "Claude help missing --fork-session");
  assert(codex.stdout.includes("Usage: codex fork"), "Codex help missing fork command");
  assert(!/^Commands:[\s\S]*gemini fork/m.test(gemini.stdout), "Gemini unexpectedly exposes a fork command");
  pass("native fork capability smoke from real CLI help", {
    claude: "--fork-session present; managed-pane native branch remains disabled pending slash smoke",
    codex: "codex fork present; managed-pane native /fork remains disabled pending slash smoke",
    gemini: "no fork command; F-Mark handoff remains v1",
  });
}

async function main() {
  let artifactRoot = null;
  let kernel = null;
  const tmuxSessions = [];
  try {
    assert(existsSync(DIST_INDEX), "kernel dist is missing; run pnpm -F f-mark build");
    artifactRoot = await mkdtemp(join(tmpdir(), "fmark-mcp-phase18-vendors-hot-"));
    report.artifactRoot = artifactRoot;
    const ctx = await makeContext(artifactRoot);
    const port = 13_000 + Math.floor(Math.random() * 300);
    kernel = await startKernel(ctx.project, port, ctx.env);
    const source = await createSession(port, `${RUN}-source`, ctx.project);
    const userId = await defaultUserId(port);
    await api(port, "POST", `/sessions/${encodeURIComponent(source.id)}/events/prose`, {
      participant_id: userId,
      content: `FMARK_${RUN}_SOURCE`,
      name: "Phase 18 Vendor Source",
    });

    report.versions.claude = (await run("claude", ["--version"], { env: ctx.env })).stdout.trim();
    report.versions.codex = (await run("codex", ["--version"], { env: ctx.env })).stdout.trim();
    report.versions.gemini = (await run("gemini", ["--version"], { env: ctx.env })).stdout.trim();
    await checkNativeHelp(ctx);

    const agents = [
      { vendor: "claude", participantId: "ag-p18-claude", runtimeId: "claude", name: "Phase18 Claude" },
      { vendor: "codex", participantId: "ag-p18-codex", runtimeId: "codex", name: "Phase18 Codex" },
      { vendor: "gemini", participantId: "ag-p18-gemini", runtimeId: "gemini", name: "Phase18 Gemini" },
    ];
    for (const agent of agents) {
      await registerLinkedAgent(port, source.id, agent.participantId, agent.runtimeId, agent.name);
    }
    const tmuxByVendor = {};
    tmuxByVendor.claude = await startVendorSession(ctx, {
      participantId: "ag-p18-claude",
      runtimeId: "claude",
      sessionId: source.id,
      executable: "claude",
      args: ["--permission-mode", "bypassPermissions", "--tools", ""],
      extraEnv: { HOME: REAL_HOME },
    });
    tmuxSessions.push(tmuxByVendor.claude);
    tmuxByVendor.codex = await startVendorSession(ctx, {
      participantId: "ag-p18-codex",
      runtimeId: "codex",
      sessionId: source.id,
      executable: "codex",
      args: ["--no-alt-screen", "-C", ctx.project, "-a", "never", "-s", "workspace-write"],
      extraEnv: { HOME: ctx.home, CODEX_HOME: ctx.codexHome },
    });
    tmuxSessions.push(tmuxByVendor.codex);
    tmuxByVendor.gemini = await startVendorSession(ctx, {
      participantId: "ag-p18-gemini",
      runtimeId: "gemini",
      sessionId: source.id,
      executable: "gemini",
      args: ["--skip-trust", "--approval-mode", "yolo"],
      extraEnv: { HOME: ctx.home, GEMINI_CLI_TRUST_WORKSPACE: "true" },
    });
    tmuxSessions.push(tmuxByVendor.gemini);

    await sleep(2500);
    const fork = await api(port, "POST", `/sessions/${encodeURIComponent(source.id)}/fork`, {
      name: `${RUN}-fork`,
    });
    assert(
      fork.agents.filter((agent) => agent.status === "rebound").length === 3,
      `expected all vendor panes rebound, got ${JSON.stringify(fork.agents)}`,
    );
    const handoffEcho = {};
    for (const [vendor, sessionName] of Object.entries(tmuxByVendor)) {
      try {
        const pane = await waitForPaneText(
          ctx,
          sessionName,
          ["F-Mark fork handoff", source.id, fork.session.id],
          8_000,
        );
        handoffEcho[vendor] = { visible: true, paneTail: pane.slice(-800) };
      } catch {
        const pane = await captureTmux(ctx, sessionName).catch((err) =>
          `capture failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        handoffEcho[vendor] = { visible: false, paneTail: pane.slice(-800) };
      }
    }
    const afterForkParticipants = await api(port, "GET", "/participants");
    for (const agent of agents) {
      assert(
        afterForkParticipants.participants?.[agent.participantId]?.active_session === fork.session.id,
        `${agent.vendor} active session did not move to fork`,
      );
    }
    pass("real vendor managed panes rebound through F-Mark fork route", {
      sourceSessionId: source.id,
      forkSessionId: fork.session.id,
      tmuxSessions,
      handoffEcho,
      agents: fork.agents.map((agent) => ({
        participantId: agent.participant_id,
        runtimeId: agent.runtime_id,
        status: agent.status,
      })),
    });

    for (const sessionName of tmuxSessions) {
      await killTmux(ctx, sessionName);
    }

    for (const agent of agents) {
      await runVendorMcpWrite(ctx, port, agent.vendor, {
        participantId: agent.participantId,
        runtimeId: agent.runtimeId,
        sourceSessionId: source.id,
      }, fork.session.id);
    }

    await writeFile(join(artifactRoot, "report.json"), JSON.stringify(report, null, 2));
    console.log(`HOT_TEST_REPORT ${join(artifactRoot, "report.json")}`);
    console.log(JSON.stringify({ run: RUN, artifactRoot, passes: report.checks.length }, null, 2));
  } catch (error) {
    if (artifactRoot === null) artifactRoot = await mkdtemp(join(tmpdir(), "fmark-mcp-phase18-vendors-hot-"));
    report.checks.push({
      name: "Phase 18 vendor fork hot runner",
      status: "FAIL",
      error: error instanceof Error ? error.message : String(error),
    });
    await writeFile(join(artifactRoot, "report.failed.json"), JSON.stringify(report, null, 2));
    console.error(`HOT_TEST_FAILED_REPORT ${join(artifactRoot, "report.failed.json")}`);
    throw error;
  } finally {
    if (artifactRoot !== null) {
      const ctx = {
        project: join(artifactRoot, "project"),
        env: { ...process.env, TMUX_TMPDIR: join(artifactRoot, "tmux") },
      };
      for (const sessionName of tmuxSessions) await killTmux(ctx, sessionName);
      try {
        await run("tmux", ["kill-server"], {
          cwd: ctx.project,
          env: ctx.env,
          timeoutMs: 5_000,
        });
      } catch {
        // already gone
      }
    }
    if (kernel !== null) await kernel.stop();
    if (artifactRoot !== null && process.env.FMARK_HOT_KEEP !== "1") {
      const reportPath = existsSync(join(artifactRoot, "report.json"))
        ? join(artifactRoot, "report.json")
        : join(artifactRoot, "report.failed.json");
      const saved = existsSync(reportPath) ? await readFile(reportPath, "utf8") : null;
      for (const entry of await readdir(artifactRoot)) {
        if (entry === "report.json" || entry === "report.failed.json") continue;
        await rm(join(artifactRoot, entry), { recursive: true, force: true });
      }
      if (saved !== null) await writeFile(reportPath, saved);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
