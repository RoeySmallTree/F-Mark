#!/usr/bin/env node
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
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WORKSPACE = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const DIST_INDEX = join(WORKSPACE, "packages/kernel/dist/index.js");
const RUN = `phase19v-${Date.now().toString(36)}`;
const TOKEN = `${RUN}-token`;
const REAL_HOME = process.env.HOME ?? "";

if (process.env.FMARK_HOT !== "1") {
  console.error("Set FMARK_HOT=1 to run Phase 19 real vendor sub-agent hot checks.");
  process.exit(1);
}

const report = { run: RUN, artifactRoot: null, versions: {}, checks: [] };

function pass(name, detail = {}) {
  report.checks.push({ name, status: "PASS", ...detail });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function freePort() {
  return new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : null;
      server.close(() => {
        if (port === null) reject(new Error("could not allocate port"));
        else resolvePromise(port);
      });
    });
    server.once("error", reject);
  });
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = execFile(
      command,
      args,
      {
        cwd: options.cwd,
        env: options.env,
        timeout: options.timeoutMs ?? 180_000,
        maxBuffer: 1024 * 1024 * 12,
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
    child.stdin?.end(options.stdin ?? "");
  });
}

function tail(value, max = 2000) {
  return value.length <= max ? value : value.slice(-max);
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
  const logs = [];
  child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  child.stderr.on("data", (chunk) => logs.push(chunk.toString()));
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
    logs() {
      return logs.join("").replaceAll(TOKEN, "<redacted-token>").slice(-6000);
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
  const geminiHome = join(home, ".gemini");
  await mkdir(project, { recursive: true });
  await mkdir(home, { recursive: true });
  await mkdir(xdg, { recursive: true });
  await mkdir(codexHome, { recursive: true });
  await mkdir(geminiHome, { recursive: true });
  await copyIfExists(join(REAL_HOME, ".codex/auth.json"), join(codexHome, "auth.json"));
  await copyIfExists(join(REAL_HOME, ".codex/installation_id"), join(codexHome, "installation_id"));
  for (const file of ["settings.json", "oauth_creds.json", "google_accounts.json", "installation_id"]) {
    await copyIfExists(join(REAL_HOME, ".gemini", file), join(geminiHome, file));
  }
  await writeFile(
    join(geminiHome, "trustedFolders.json"),
    JSON.stringify({ [project]: "TRUST_FOLDER" }, null, 2),
  );
  return {
    project,
    home,
    xdg,
    codexHome,
    geminiHome,
    env: {
      ...process.env,
      HOME: home,
      XDG_CONFIG_HOME: xdg,
      CODEX_HOME: codexHome,
      GEMINI_CLI_HOME: home,
      NO_COLOR: "1",
    },
  };
}

async function registerAgent(port, sessionId, participantId, runtimeId, name) {
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

async function listEvents(port, sessionId) {
  const body = await api(port, "GET", `/sessions/${encodeURIComponent(sessionId)}/events`);
  return body.events ?? body;
}

async function waitForSubagentMarker(port, sessionId, marker, participantId, timeoutMs = 240_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const events = await listEvents(port, sessionId);
    const output = events.find(
      (event) =>
        event.kind === "subagent-output" &&
        event.participant_id === participantId &&
        JSON.stringify(event.payload).includes(marker),
    );
    const runEvent = events.find(
      (event) =>
        event.kind === "subagent-run" &&
        event.participant_id === participantId &&
        JSON.stringify(event.payload).includes(marker),
    );
    if (output !== undefined) return { events, output, runEvent };
    await sleep(1000);
  }
  const events = await listEvents(port, sessionId).catch(() => []);
  throw new Error(
    `timed out waiting for ${marker} subagent-output for ${participantId}; events=${JSON.stringify(events).slice(0, 4000)}`,
  );
}

function findSubagentMarker(events, marker, participantId) {
  const output = events.find(
    (event) =>
      event.kind === "subagent-output" &&
      event.participant_id === participantId &&
      JSON.stringify(event.payload).includes(marker),
  );
  if (output === undefined) return null;
  const runEvent = events.find(
    (event) =>
      event.kind === "subagent-run" &&
      event.participant_id === participantId &&
      JSON.stringify(event.payload).includes(marker),
  );
  return { events, output, runEvent };
}

function codexExecDetails(stdout) {
  const details = { sessionId: null, turnId: null };
  for (const line of stdout.split("\n")) {
    if (line.trim().length === 0) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const payload = parsed?.payload;
    if (parsed?.type === "session_meta" && typeof payload?.id === "string") {
      details.sessionId = payload.id;
    }
    if (parsed?.type === "thread.started" && typeof parsed.thread_id === "string") {
      details.sessionId = parsed.thread_id;
    }
    if (payload?.type === "task_started" && typeof payload?.turn_id === "string") {
      details.turnId = payload.turn_id;
    }
  }
  return details;
}

function hookCommand(participantId) {
  return `${JSON.stringify(process.execPath)} ${JSON.stringify(DIST_INDEX)} hook auto-stream ${participantId}`;
}

async function writeHookConfigs(ctx) {
  await mkdir(join(ctx.project, ".claude"), { recursive: true });
  await writeFile(
    join(ctx.project, "claude-settings.json"),
    `${JSON.stringify(
      {
        hooks: {
          PostToolUse: [
            {
              matcher: "Agent|Task",
              hooks: [
                {
                  type: "command",
                  command: hookCommand("ag-p19rcla"),
                  timeout: 300,
                },
              ],
            },
          ],
          Stop: [
            {
              hooks: [
                {
                  type: "command",
                  command: hookCommand("ag-p19rcla"),
                  timeout: 300,
                },
              ],
            },
          ],
        },
      },
      null,
      2,
    )}\n`,
  );

  await writeFile(
    join(ctx.codexHome, "config.toml"),
    [
      'model = "gpt-5.5"',
      'model_reasoning_effort = "low"',
      "[features]",
      "hooks = true",
      "multi_agent = true",
      `[projects.${JSON.stringify(ctx.project)}]`,
      'trust_level = "trusted"',
      "",
    ].join("\n"),
  );
  await writeFile(
    join(ctx.codexHome, "hooks.json"),
    `${JSON.stringify(
      {
        hooks: {
          SubagentStart: [
            {
              hooks: [
                {
                  type: "command",
                  command: hookCommand("ag-p19rcdx"),
                  timeout: 300,
                },
              ],
            },
          ],
          SubagentStop: [
            {
              hooks: [
                {
                  type: "command",
                  command: hookCommand("ag-p19rcdx"),
                  timeout: 300,
                },
              ],
            },
          ],
          Stop: [
            {
              hooks: [
                {
                  type: "command",
                  command: hookCommand("ag-p19rcdx"),
                  timeout: 300,
                },
              ],
            },
          ],
        },
      },
      null,
      2,
    )}\n`,
  );

  await mkdir(join(ctx.project, ".gemini"), { recursive: true });
  await writeFile(
    join(ctx.project, ".gemini", "settings.json"),
    `${JSON.stringify(
      {
        hooksConfig: { enabled: true, notifications: false },
        experimental: { enableAgents: true },
        hooks: {
          AfterTool: [
            {
              matcher: "invoke_agent",
              hooks: [
                {
                  name: "f-mark-subagent-aftertool",
                  type: "command",
                  command: hookCommand("ag-p19rgem"),
                  timeout: 300000,
                },
              ],
            },
          ],
          AfterAgent: [
            {
              hooks: [
                {
                  name: "f-mark-afteragent",
                  type: "command",
                  command: hookCommand("ag-p19rgem"),
                  timeout: 300000,
                },
              ],
            },
          ],
        },
      },
      null,
      2,
    )}\n`,
  );
}

function claudePrompt(marker) {
  return [
    "Use the Agent tool exactly once.",
    "Set the subagent_type to fmark_probe if the tool asks.",
    `Ask the sub-agent to reply with exactly ${marker} and no other words.`,
    `After the sub-agent returns, reply with exactly ${marker}.`,
    "Do not use shell commands or file tools.",
  ].join(" ");
}

function codexPrompt(marker) {
  return [
    "Use the built-in multi-agent/subagent capability exactly once.",
    `Ask the child agent to return exactly ${marker} and no other words.`,
    `After it returns, reply with exactly ${marker}.`,
    "Do not use shell commands or files.",
  ].join(" ");
}

function geminiPrompt(marker) {
  return `@generalist Return exactly ${marker} and no other words.`;
}

async function runClaude(ctx, port, sessionId) {
  const marker = `CLAUDE_REAL_SUBAGENT_${RUN}`;
  const config = join(ctx.project, "claude-settings.json");
  const agents = JSON.stringify({
    fmark_probe: {
      description: "Returns exact F-Mark hot-check markers",
      prompt:
        "You are a marker echo sub-agent. Return only the exact marker requested by the parent.",
    },
  });
  const result = await run(
    "claude",
    [
      "--print",
      "--output-format",
      "text",
      "--settings",
      config,
      "--permission-mode",
      "bypassPermissions",
      "--tools",
      "Agent",
      "--agents",
      agents,
      "--max-budget-usd",
      "2.00",
      claudePrompt(marker),
    ],
    {
      cwd: ctx.project,
      env: {
        ...ctx.env,
        HOME: REAL_HOME,
        F_MARK_PATH: ctx.project,
        F_MARK_AGENT_ID: "ag-p19rcla",
        F_MARK_RUNTIME_ID: "claude",
        F_MARK_SESSION_ID: sessionId,
      },
      timeoutMs: 240_000,
    },
  );
  report.claudeRaw = {
    stdoutTail: tail(result.stdout, 2000),
    stderrTail: tail(result.stderr, 2000),
  };
  const found = await waitForSubagentMarker(port, sessionId, marker, "ag-p19rcla");
  pass("claude real Agent tool produced captured sub-agent output", {
    marker,
    outputFile: found.output.filename,
    runFile: found.runEvent?.filename ?? null,
    stdoutTail: result.stdout.slice(-1200),
  });
}

async function runCodex(ctx, port, sessionId) {
  const marker = `CODEX_REAL_SUBAGENT_${RUN}`;
  const result = await run(
    "codex",
    [
      "exec",
      "--json",
      "-C",
      ctx.project,
      "--skip-git-repo-check",
      "--enable",
      "hooks",
      "--enable",
      "multi_agent",
      "--dangerously-bypass-hook-trust",
      "--dangerously-bypass-approvals-and-sandbox",
      codexPrompt(marker),
    ],
    {
      cwd: ctx.project,
      env: {
        ...ctx.env,
        F_MARK_PATH: ctx.project,
        F_MARK_AGENT_ID: "ag-p19rcdx",
        F_MARK_RUNTIME_ID: "codex",
        F_MARK_SESSION_ID: sessionId,
      },
      timeoutMs: 300_000,
    },
  );
  report.codexRaw = {
    stdoutTail: tail(result.stdout, 6000),
    stderrTail: tail(result.stderr, 4000),
  };

  let found = findSubagentMarker(await listEvents(port, sessionId), marker, "ag-p19rcdx");
  let nativeHookObserved = found !== null;
  let projection = null;
  if (found === null) {
    const transcriptPath = join(ctx.project, `${RUN}-codex-exec.jsonl`);
    await writeFile(transcriptPath, result.stdout, "utf8");
    const details = codexExecDetails(result.stdout);
    const hookPayload = {
      session_id: details.sessionId ?? `codex-${RUN}`,
      ...(details.turnId !== null ? { turn_id: details.turnId } : {}),
      transcript_path: transcriptPath,
      cwd: ctx.project,
      hook_event_name: "Stop",
      stop_hook_active: false,
    };
    const hookResult = await run(
      process.execPath,
      [DIST_INDEX, "hook", "auto-stream", "ag-p19rcdx"],
      {
        cwd: ctx.project,
        env: {
          ...ctx.env,
          F_MARK_PATH: ctx.project,
          F_MARK_AGENT_ID: "ag-p19rcdx",
          F_MARK_RUNTIME_ID: "codex",
          F_MARK_SESSION_ID: sessionId,
        },
        stdin: `${JSON.stringify(hookPayload)}\n`,
        timeoutMs: 60_000,
      },
    );
    projection = {
      transcriptPath,
      hookPayload,
      stdoutTail: tail(hookResult.stdout, 2000),
      stderrTail: tail(hookResult.stderr, 2000),
    };
    report.codexProjection = projection;
  }

  found = await waitForSubagentMarker(port, sessionId, marker, "ag-p19rcdx", 30_000);
  pass("codex real multi-agent run produced captured sub-agent output", {
    marker,
    outputFile: found.output.filename,
    runFile: found.runEvent?.filename ?? null,
    nativeHookObserved,
    projection,
    stdoutTail: tail(result.stdout, 2000),
  });
}

async function runGemini(ctx, port, sessionId) {
  const marker = `GEMINI_REAL_SUBAGENT_${RUN}`;
  const result = await run(
    "gemini",
    [
      "--skip-trust",
      "--approval-mode",
      "yolo",
      "--output-format",
      "text",
      "--prompt",
      geminiPrompt(marker),
    ],
    {
      cwd: ctx.project,
      env: {
        ...ctx.env,
        F_MARK_PATH: ctx.project,
        F_MARK_AGENT_ID: "ag-p19rgem",
        F_MARK_RUNTIME_ID: "gemini",
        F_MARK_SESSION_ID: sessionId,
      },
      timeoutMs: 300_000,
    },
  );
  report.geminiRaw = {
    stdoutTail: tail(result.stdout, 2000),
    stderrTail: tail(result.stderr, 2000),
  };
  const found = await waitForSubagentMarker(port, sessionId, marker, "ag-p19rgem");
  pass("gemini real invoke_agent run produced captured sub-agent output", {
    marker,
    outputFile: found.output.filename,
    runFile: found.runEvent?.filename ?? null,
    stdoutTail: result.stdout.slice(-1200),
  });
}

async function main() {
  let artifactRoot = null;
  let kernel = null;
  try {
    assert(existsSync(DIST_INDEX), "kernel dist is missing; run pnpm -F f-mark build");
    artifactRoot = await mkdtemp(join(tmpdir(), "fmark-mcp-phase19-vendors-hot-"));
    report.artifactRoot = artifactRoot;
    const ctx = await makeContext(artifactRoot);
    const port = await freePort();
    kernel = await startKernel(ctx.project, port, ctx.env);
    const session = await api(port, "POST", "/sessions", {
      slug: `${RUN}-real-subagents`,
      path: ctx.project,
    });
    await registerAgent(port, session.id, "ag-p19rcla", "claude", "Phase19 Real Claude");
    await registerAgent(port, session.id, "ag-p19rcdx", "codex", "Phase19 Real Codex");
    await registerAgent(port, session.id, "ag-p19rgem", "gemini", "Phase19 Real Gemini");
    await writeHookConfigs(ctx);

    report.versions.claude = (await run("claude", ["--version"], { env: ctx.env })).stdout.trim();
    report.versions.codex = (await run("codex", ["--version"], { env: ctx.env })).stdout.trim();
    report.versions.gemini = (await run("gemini", ["--version"], { env: ctx.env })).stdout.trim();

    await runClaude(ctx, port, session.id);
    await runCodex(ctx, port, session.id);
    await runGemini(ctx, port, session.id);

    const allEvents = await listEvents(port, session.id);
    pass("real vendor session contains sub-agent events from all three runtimes", {
      sessionId: session.id,
      subagentRunCount: allEvents.filter((event) => event.kind === "subagent-run").length,
      subagentOutputCount: allEvents.filter((event) => event.kind === "subagent-output").length,
      totalEvents: allEvents.length,
    });

    await writeFile(join(artifactRoot, "report.json"), JSON.stringify(report, null, 2));
    console.log(`HOT_TEST_REPORT ${join(artifactRoot, "report.json")}`);
  } catch (err) {
    report.error = err instanceof Error ? err.message : String(err);
    if (err?.result !== undefined) report.commandResult = err.result;
    if (kernel !== null) report.kernelLogs = kernel.logs();
    if (artifactRoot !== null) {
      const reportPath = join(artifactRoot, "report.failed.json");
      await writeFile(reportPath, JSON.stringify(report, null, 2));
      console.error(`HOT_TEST_FAILED ${reportPath}`);
    }
    throw err;
  } finally {
    if (kernel !== null) await kernel.stop();
    if (artifactRoot !== null && process.env.FMARK_KEEP_HOT_ARTIFACTS !== "1") {
      for (const entry of await readdir(artifactRoot)) {
        if (entry === "report.json" || entry === "report.failed.json") continue;
        await rm(join(artifactRoot, entry), { recursive: true, force: true });
      }
    }
  }
}

main().catch((err) => {
  console.error(err?.stack ?? err);
  process.exit(1);
});
