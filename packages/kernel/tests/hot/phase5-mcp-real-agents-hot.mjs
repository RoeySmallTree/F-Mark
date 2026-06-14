#!/usr/bin/env node
import { spawn, execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const WORKSPACE = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const KERNEL_DIR = join(WORKSPACE, "packages/kernel");
const DIST_INDEX = join(KERNEL_DIR, "dist/index.js");
const RUN = `phase5-${Date.now().toString(36)}`;
const TOKEN = `${RUN}-token`;

if (process.env.FMARK_HOT !== "1") {
  console.error("Set FMARK_HOT=1 to run Phase 5 MCP real-agent hot checks.");
  process.exit(1);
}

const report = {
  run: RUN,
  workspace: WORKSPACE,
  artifactRoot: null,
  project: null,
  checks: [],
  vendors: {},
};

function pass(name, detail = {}) {
  report.checks.push({ name, status: "PASS", ...detail });
}

function fail(name, error, detail = {}) {
  report.checks.push({
    name,
    status: "FAIL",
    error: error instanceof Error ? error.message : String(error),
    ...detail,
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function redact(value) {
  if (typeof value !== "string") return value;
  return value.replaceAll(TOKEN, "<redacted-token>");
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = execFile(
      command,
      args,
      {
        cwd: options.cwd ?? WORKSPACE,
        env: options.env ?? process.env,
        timeout: options.timeoutMs ?? 180_000,
        maxBuffer: options.maxBuffer ?? 1024 * 1024 * 8,
      },
      (error, stdout, stderr) => {
        const result = {
          command: [command, ...args].join(" "),
          code: error?.code ?? 0,
          signal: error?.signal ?? null,
          stdout: stdout.toString(),
          stderr: stderr.toString(),
        };
        if (error) {
          const wrapped = new Error(
            `${result.command} failed code ${result.code}: ${result.stderr || result.stdout}`,
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

async function http(port, path, init = {}) {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("Authorization", `Bearer ${TOKEN}`);
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    ...init,
    headers,
  });
  const text = await res.text();
  let body = text;
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} failed ${res.status}: ${text}`);
  }
  return body;
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
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error("kernel health check timed out");
}

async function startKernel(project, port, env) {
  const child = spawn(
    process.execPath,
    [DIST_INDEX, "--path", project, "--port", String(port), "--password", TOKEN],
    {
      cwd: project,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
  child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
  await waitForHealth(port);
  return {
    child,
    stdout,
    stderr,
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

async function createSessionAndAgent(port, slug, participantId, name, runtimeId = "codex") {
  const session = await http(port, "/sessions", {
    method: "POST",
    body: JSON.stringify({ slug }),
  });
  await http(port, "/participants/register", {
    method: "POST",
    body: JSON.stringify({
      kind: "agent",
      name,
      suggested_id: participantId,
    }),
  });
  await http(port, `/agents/${encodeURIComponent(participantId)}/link`, {
    method: "POST",
    body: JSON.stringify({ session_id: session.id }),
  });
  return {
    sessionId: session.id,
    participantId,
    runtimeId,
  };
}

function mcpEnv(baseEnv, project, agent) {
  return {
    ...baseEnv,
    F_MARK_PATH: project,
    F_MARK_AGENT_ID: agent.participantId,
    F_MARK_RUNTIME_ID: agent.runtimeId,
  };
}

async function withMcpClient(project, env, fn) {
  const stderr = [];
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [DIST_INDEX, "mcp", "--path", project],
    cwd: project,
    env,
    stderr: "pipe",
  });
  transport.stderr?.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
  const client = new Client({ name: "fmark-phase5-hot", version: "0.0.1" }, { capabilities: {} });
  try {
    await client.connect(transport);
    return await fn(client, () => Buffer.concat(stderr).toString("utf8"));
  } finally {
    await client.close().catch(() => {});
  }
}

function toolText(result) {
  return (result.content ?? [])
    .filter((entry) => entry.type === "text")
    .map((entry) => entry.text)
    .join("\n");
}

function assertToolOk(result, marker) {
  const text = toolText(result);
  assert(result.isError !== true, `tool returned MCP error: ${text}`);
  assert(text.includes(marker), `tool result missing ${marker}: ${text}`);
  return text;
}

function assertToolError(result, marker) {
  const text = toolText(result);
  assert(result.isError === true || /failed|no active|unknown/i.test(text), `expected MCP error, got: ${text}`);
  assert(text.includes(marker), `MCP error missing ${marker}: ${text}`);
}

async function readEvents(port, sessionId) {
  return http(port, `/sessions/${encodeURIComponent(sessionId)}/events`);
}

async function waitForSessionMarker(port, sessionId, marker, timeoutMs = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const body = await readEvents(port, sessionId);
    const raw = JSON.stringify(body);
    if (raw.includes(marker)) return body;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw new Error(`timed out waiting for ${marker} in ${sessionId}`);
}

async function expectTurnEnd(port, sessionId, participantId) {
  const body = await readEvents(port, sessionId);
  assert(
    body.events.some((event) => event.kind === "turn-end" && event.participant_id === participantId),
    `missing turn-end for ${participantId}`,
  );
}

async function protocolHotChecks(project, port, env, agent) {
  const wsMessages = [];
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${encodeURIComponent(TOKEN)}`);
  ws.on("message", (message) => wsMessages.push(message.toString()));
  await new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error("ws open timeout")), 5_000);
    ws.once("open", () => {
      clearTimeout(timer);
      resolvePromise();
    });
    ws.once("error", reject);
  });

  const marker = `FMARK_${RUN}_SDK_POST_PROSE`;
  await withMcpClient(project, mcpEnv(env, project, agent), async (client) => {
    const tools = await client.listTools();
    for (const name of ["fmark_read_events", "fmark_post_prose", "fmark_end_turn"]) {
      assert(tools.tools.some((tool) => tool.name === name), `missing MCP tool ${name}`);
    }
    const guide = await client.readResource({ uri: "fmark://guide" });
    const guideText = (guide.contents ?? []).map((entry) => entry.text ?? "").join("\n");
    assert(guideText.includes(agent.sessionId), "guide resource did not include active session");
    assert(guideText.includes(agent.participantId), "guide resource did not include participant");

    const prose = await client.callTool({
      name: "fmark_post_prose",
      arguments: { content: marker },
    });
    assertToolOk(prose, "filename");
    const turn = await client.callTool({
      name: "fmark_end_turn",
      arguments: {},
    });
    assertToolOk(turn, "turn-end");
    const read = await client.callTool({
      name: "fmark_read_events",
      arguments: { kinds: ["prose", "turn-end"] },
    });
    assertToolOk(read, marker);
  });

  await waitForSessionMarker(port, agent.sessionId, marker);
  await expectTurnEnd(port, agent.sessionId, agent.participantId);
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  assert(
    wsMessages.some((message) => message.includes("event_added") && message.includes("prose")),
    "websocket did not see MCP prose event_added",
  );
  assert(
    wsMessages.some((message) => message.includes("event_added") && message.includes("turn-end")),
    "websocket did not see MCP turn-end event_added",
  );
  ws.close();
  pass("MCP protocol live kernel read/resource/write/ws", {
    sessionId: agent.sessionId,
    participantId: agent.participantId,
    marker,
  });
}

async function negativeHotChecks(project, port, env, agent, unlinkedAgent) {
  await withMcpClient(project, mcpEnv(env, project, unlinkedAgent), async (client) => {
    const result = await client.callTool({
      name: "fmark_post_prose",
      arguments: { content: "SHOULD_NOT_WRITE_NO_ACTIVE_SESSION" },
    });
    assertToolError(result, "no active F-Mark session");
  });
  pass("MCP negative no active session");

  await withMcpClient(project, mcpEnv(env, project, agent), async (client) => {
    const result = await client.callTool({
      name: "fmark_post_prose",
      arguments: {
        session_id: agent.sessionId,
        participant_id: "ag-nope",
        content: "SHOULD_NOT_WRITE_UNKNOWN_PARTICIPANT",
      },
    });
    assertToolError(result, "unknown participant");
  });
  pass("MCP negative unknown participant");

  const tokenPath = join(project, ".f-mark/.token");
  await writeFile(tokenPath, "bad-token", "utf8");
  try {
    await withMcpClient(project, mcpEnv(env, project, agent), async (client) => {
      const result = await client.callTool({
        name: "fmark_post_prose",
        arguments: { content: "SHOULD_NOT_WRITE_STALE_TOKEN" },
      });
      assertToolError(result, "401");
    });
  } finally {
    await writeFile(tokenPath, TOKEN, "utf8");
  }
  pass("MCP negative stale token");
}

async function copyIfExists(from, to) {
  if (!existsSync(from)) return false;
  await mkdir(join(to, ".."), { recursive: true });
  await copyFile(from, to);
  return true;
}

async function prepareCodexHome(home) {
  const codexHome = join(home, ".codex");
  await mkdir(codexHome, { recursive: true });
  await copyIfExists(join(process.env.HOME, ".codex/auth.json"), join(codexHome, "auth.json"));
  await copyIfExists(join(process.env.HOME, ".codex/installation_id"), join(codexHome, "installation_id"));
  return codexHome;
}

async function prepareGeminiHome(home, project) {
  const geminiHome = join(home, ".gemini");
  await mkdir(geminiHome, { recursive: true });
  for (const file of ["settings.json", "oauth_creds.json", "google_accounts.json", "installation_id"]) {
    await copyIfExists(join(process.env.HOME, ".gemini", file), join(geminiHome, file));
  }
  await writeFile(
    join(geminiHome, "trustedFolders.json"),
    JSON.stringify({ [project]: "TRUST_FOLDER" }, null, 2),
  );
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
              F_MARK_SESSION_ID: agent.sessionId,
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

async function configureCodexMcp(project, env, agent) {
  await run(
    "codex",
    [
      "mcp",
      "add",
      "--env",
      `F_MARK_PATH=${project}`,
      "--env",
      `F_MARK_AGENT_ID=${agent.participantId}`,
      "--env",
      `F_MARK_SESSION_ID=${agent.sessionId}`,
      "--env",
      `F_MARK_RUNTIME_ID=${agent.runtimeId}`,
      "fmark",
      "--",
      process.execPath,
      DIST_INDEX,
      "mcp",
      "--path",
      project,
    ],
    { cwd: project, env, timeoutMs: 30_000 },
  );
}

async function configureGeminiMcp(project, env, agent) {
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
      `F_MARK_PATH=${project}`,
      "-e",
      `F_MARK_AGENT_ID=${agent.participantId}`,
      "-e",
      `F_MARK_SESSION_ID=${agent.sessionId}`,
      "-e",
      `F_MARK_RUNTIME_ID=${agent.runtimeId}`,
      "fmark",
      process.execPath,
      DIST_INDEX,
      "mcp",
      "--path",
      project,
    ],
    { cwd: project, env, timeoutMs: 30_000 },
  );
}

function vendorPrompt(vendor, marker) {
  return [
    `You are hot-testing F-Mark MCP for ${vendor}.`,
    "Use MCP server fmark only. Do not use curl, shell, files, or REST.",
    `Tool call 1: fmark_post_prose with arguments exactly {"content":"${marker}"}.`,
    'Tool call 2: fmark_end_turn with arguments exactly {}.',
    "After both MCP tool calls succeed, reply with exactly DONE.",
  ].join(" ");
}

async function runClaudeAgent(project, artifactRoot, env, agent) {
  const marker = `FMARK_${RUN}_CLAUDE_AGENT_MCP`;
  const config = join(artifactRoot, "claude-mcp.json");
  await writeClaudeMcpConfig(config, project, agent);
  const claudeEnv = {
    ...process.env,
    NO_COLOR: "1",
    FMARK_PORT: env.FMARK_PORT,
  };
  const result = await run(
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
      "mcp__fmark__fmark_post_prose,mcp__fmark__fmark_end_turn,mcp__fmark__fmark_read_events",
      "--max-budget-usd",
      "1.00",
      vendorPrompt("claude", marker),
    ],
    { cwd: project, env: claudeEnv, timeoutMs: 180_000 },
  );
  await waitForSessionMarker(env.FMARK_PORT, agent.sessionId, marker, 30_000);
  await expectTurnEnd(env.FMARK_PORT, agent.sessionId, agent.participantId);
  report.vendors.claude = {
    marker,
    sessionId: agent.sessionId,
    stdout: redact(result.stdout).slice(-4000),
    stderr: redact(result.stderr).slice(-4000),
  };
  pass("Claude real agent MCP write/end-turn", { marker, sessionId: agent.sessionId });
}

async function runCodexAgent(project, env, agent) {
  const marker = `FMARK_${RUN}_CODEX_AGENT_MCP`;
  await configureCodexMcp(project, env, agent);
  const result = await run(
    "codex",
    [
      "exec",
      "--json",
      "-C",
      project,
      "--skip-git-repo-check",
      "--dangerously-bypass-approvals-and-sandbox",
      vendorPrompt("codex", marker),
    ],
    { cwd: project, env, timeoutMs: 240_000 },
  );
  report.vendors.codex = {
    marker,
    sessionId: agent.sessionId,
    stdout: redact(result.stdout).slice(-4000),
    stderr: redact(result.stderr).slice(-4000),
  };
  await waitForSessionMarker(env.FMARK_PORT, agent.sessionId, marker, 30_000);
  await expectTurnEnd(env.FMARK_PORT, agent.sessionId, agent.participantId);
  pass("Codex real agent MCP write/end-turn", { marker, sessionId: agent.sessionId });
}

async function runGeminiAgent(project, env, agent) {
  const marker = `FMARK_${RUN}_GEMINI_AGENT_MCP`;
  await configureGeminiMcp(project, env, agent);
  const result = await run(
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
      vendorPrompt("gemini", marker),
    ],
    { cwd: project, env, timeoutMs: 240_000 },
  );
  report.vendors.gemini = {
    marker,
    sessionId: agent.sessionId,
    stdout: redact(result.stdout).slice(-4000),
    stderr: redact(result.stderr).slice(-4000),
  };
  await waitForSessionMarker(env.FMARK_PORT, agent.sessionId, marker, 30_000);
  await expectTurnEnd(env.FMARK_PORT, agent.sessionId, agent.participantId);
  pass("Gemini real agent MCP write/end-turn", { marker, sessionId: agent.sessionId });
}

async function listSessionFiles(project, sessionId) {
  return readdir(join(project, ".f-mark/sessions", sessionId));
}

async function main() {
  let kernel = null;
  const artifactRoot = await mkdtemp(join(tmpdir(), "fmark-mcp-phase5-hot-"));
  const project = join(artifactRoot, "project");
  const home = join(artifactRoot, "home");
  const xdg = join(artifactRoot, "xdg");
  await mkdir(project, { recursive: true });
  await mkdir(home, { recursive: true });
  await mkdir(xdg, { recursive: true });
  report.artifactRoot = artifactRoot;
  report.project = project;
  const port = 8500 + Math.floor(Math.random() * 1000);
  const baseEnv = {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: xdg,
    CODEX_HOME: join(home, ".codex"),
    NO_COLOR: "1",
    FMARK_PORT: String(port),
  };
  await prepareCodexHome(home);
  await prepareGeminiHome(home, project);

  try {
    kernel = await startKernel(project, port, baseEnv);
    pass("Kernel started", { project: basename(project), port });

    const sdkAgent = await createSessionAndAgent(port, `${RUN}-sdk`, "ag-p5sdk", "Phase 5 SDK", "codex");
    const unlinkedSession = await http(port, "/sessions", {
      method: "POST",
      body: JSON.stringify({ slug: `${RUN}-unlinked` }),
    });
    await http(port, "/participants/register", {
      method: "POST",
      body: JSON.stringify({
        kind: "agent",
        name: "Phase 5 Unlinked",
        suggested_id: "ag-p5none",
      }),
    });
    const unlinkedAgent = {
      sessionId: unlinkedSession.id,
      participantId: "ag-p5none",
      runtimeId: "codex",
    };
    await protocolHotChecks(project, port, baseEnv, sdkAgent);
    await negativeHotChecks(project, port, baseEnv, sdkAgent, unlinkedAgent);

    const claudeAgent = await createSessionAndAgent(port, `${RUN}-claude`, "ag-p5cld", "Phase 5 Claude", "claude");
    const codexAgent = await createSessionAndAgent(port, `${RUN}-codex`, "ag-p5cxd", "Phase 5 Codex", "codex");
    const geminiAgent = await createSessionAndAgent(port, `${RUN}-gemini`, "ag-p5gem", "Phase 5 Gemini", "gemini");

    await runClaudeAgent(project, artifactRoot, baseEnv, claudeAgent);
    await runCodexAgent(project, { ...baseEnv, CODEX_HOME: join(home, ".codex") }, codexAgent);
    await runGeminiAgent(project, baseEnv, geminiAgent);

    report.sessions = {
      sdk: {
        id: sdkAgent.sessionId,
        files: await listSessionFiles(project, sdkAgent.sessionId),
      },
      claude: {
        id: claudeAgent.sessionId,
        files: await listSessionFiles(project, claudeAgent.sessionId),
      },
      codex: {
        id: codexAgent.sessionId,
        files: await listSessionFiles(project, codexAgent.sessionId),
      },
      gemini: {
        id: geminiAgent.sessionId,
        files: await listSessionFiles(project, geminiAgent.sessionId),
      },
    };
    await writeFile(join(artifactRoot, "report.json"), JSON.stringify(report, null, 2));
    console.log(`HOT_TEST_REPORT ${join(artifactRoot, "report.json")}`);
    console.log(JSON.stringify({
      run: RUN,
      artifactRoot,
      project,
      passes: report.checks.filter((check) => check.status === "PASS").length,
      vendors: Object.keys(report.vendors),
    }, null, 2));
  } catch (error) {
    fail("Phase 5 hot runner", error);
    await writeFile(join(artifactRoot, "report.failed.json"), JSON.stringify(report, null, 2));
    console.error(`HOT_TEST_FAILED_REPORT ${join(artifactRoot, "report.failed.json")}`);
    throw error;
  } finally {
    if (kernel !== null) await kernel.stop();
    if (process.env.FMARK_HOT_KEEP !== "1") {
      const reportJson = existsSync(join(artifactRoot, "report.json"))
        ? await readFile(join(artifactRoot, "report.json"), "utf8")
        : existsSync(join(artifactRoot, "report.failed.json"))
          ? await readFile(join(artifactRoot, "report.failed.json"), "utf8")
          : null;
      await rm(project, { recursive: true, force: true });
      await rm(home, { recursive: true, force: true });
      await rm(xdg, { recursive: true, force: true });
      if (reportJson !== null) {
        await writeFile(
          join(artifactRoot, existsSync(join(artifactRoot, "report.json")) ? "report.json" : "report.failed.json"),
          reportJson,
        );
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
