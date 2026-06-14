#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";

const WORKSPACE = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const DIST_INDEX = join(WORKSPACE, "packages/kernel/dist/index.js");
const RUN = `phase22-${Date.now().toString(36)}`;
const TOKEN = `${RUN}-token`;
const REAL_HOME = process.env.HOME ?? "";

if (process.env.FMARK_HOT !== "1") {
  console.error("Set FMARK_HOT=1 to run Phase 22 Streamable HTTP MCP hot checks.");
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

function redact(value) {
  return String(value).replaceAll(TOKEN, "<redacted-token>");
}

function tail(value, max = 2400) {
  const redacted = redact(value);
  return redacted.length <= max ? redacted : redacted.slice(-max);
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
        maxBuffer: 1024 * 1024 * 16,
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
            `${result.command} failed with code ${result.code}: ${tail(result.stderr || result.stdout, 4000)}`,
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
      return tail(logs.join(""), 6000);
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

async function mcpFetch(port, method, headers = {}, body = undefined) {
  const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, text };
}

function initializeBody(id = "init") {
  return {
    jsonrpc: "2.0",
    id,
    method: "initialize",
    params: {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "fmark-phase22-hot", version: "0.0.1" },
    },
  };
}

function initializedNotification() {
  return { jsonrpc: "2.0", method: "notifications/initialized", params: {} };
}

function parseMcpResponse(headers, text) {
  const contentType = headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return JSON.parse(text);
  if (!contentType.includes("text/event-stream")) return JSON.parse(text);

  const messages = [];
  let dataLines = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.length === 0) {
      if (dataLines.length > 0) {
        messages.push(dataLines.join("\n"));
        dataLines = [];
      }
      continue;
    }
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (dataLines.length > 0) messages.push(dataLines.join("\n"));
  assert(messages.length > 0, `SSE response had no data messages: ${text.slice(0, 400)}`);
  return JSON.parse(messages[0]);
}

function toolsListBody(id = "tools") {
  return { jsonrpc: "2.0", id, method: "tools/list", params: {} };
}

async function createRawMcpSession(port) {
  const init = await mcpFetch(
    port,
    "POST",
    {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    initializeBody(),
  );
  assert(init.status === 200, `raw initialize returned ${init.status}: ${init.text}`);
  const sessionId = init.headers.get("mcp-session-id");
  assert(typeof sessionId === "string" && sessionId.length > 0, "initialize did not return Mcp-Session-Id");
  const parsed = parseMcpResponse(init.headers, init.text);
  assert(parsed.result?.serverInfo?.name === "f-mark", "raw initialize did not reach F-Mark MCP server");

  const notify = await mcpFetch(
    port,
    "POST",
    {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "Mcp-Session-Id": sessionId,
    },
    initializedNotification(),
  );
  assert(notify.status === 202, `initialized notification returned ${notify.status}: ${notify.text}`);
  return sessionId;
}

async function probeSse(port, sessionId) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: "text/event-stream",
        "Mcp-Session-Id": sessionId,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const contentType = res.headers.get("content-type") ?? "";
    assert(res.status === 200, `GET/SSE returned ${res.status}`);
    assert(contentType.includes("text/event-stream"), `GET/SSE content-type was ${contentType}`);
    await res.body?.cancel();
  } finally {
    clearTimeout(timeout);
  }
}

async function assertProtocolEdges(port) {
  const cors = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:3000",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers":
        "authorization,content-type,mcp-session-id,mcp-protocol-version,last-event-id",
    },
  });
  assert(cors.status === 204, `CORS preflight returned ${cors.status}`);
  const allowHeaders = cors.headers.get("access-control-allow-headers") ?? "";
  assert(/mcp-session-id/i.test(allowHeaders), "CORS missing Mcp-Session-Id allow header");
  assert(/mcp-protocol-version/i.test(allowHeaders), "CORS missing MCP-Protocol-Version allow header");
  assert(/last-event-id/i.test(allowHeaders), "CORS missing Last-Event-ID allow header");
  assert(
    /mcp-session-id/i.test(cors.headers.get("access-control-expose-headers") ?? ""),
    "CORS missing Mcp-Session-Id expose header",
  );
  pass("CORS preflight exposes MCP protocol headers", {
    allowHeaders,
    exposeHeaders: cors.headers.get("access-control-expose-headers") ?? "",
  });

  const noAuth = await mcpFetch(
    port,
    "POST",
    { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    initializeBody("no-auth"),
  );
  assert(noAuth.status === 401, `missing bearer auth returned ${noAuth.status}`);

  const queryAuth = await fetch(`http://127.0.0.1:${port}/mcp?token=${encodeURIComponent(TOKEN)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify(initializeBody("query-auth")),
  });
  assert(queryAuth.status === 401, `query-token auth returned ${queryAuth.status}`);

  const cookieAuth = await mcpFetch(
    port,
    "POST",
    {
      Cookie: `fmark_token=${encodeURIComponent(TOKEN)}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    initializeBody("cookie-auth"),
  );
  assert(cookieAuth.status === 401, `cookie auth returned ${cookieAuth.status}`);

  const badOrigin = await mcpFetch(
    port,
    "POST",
    {
      Authorization: `Bearer ${TOKEN}`,
      Origin: "https://evil.example",
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    initializeBody("bad-origin"),
  );
  assert(badOrigin.status === 403, `non-local origin returned ${badOrigin.status}`);
  pass("HTTP MCP is bearer-only and rejects non-local browser origins");

  const missingPost = await mcpFetch(
    port,
    "POST",
    {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    toolsListBody("missing-post"),
  );
  assert(missingPost.status === 400, `POST missing session returned ${missingPost.status}`);

  const invalidPost = await mcpFetch(
    port,
    "POST",
    {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "Mcp-Session-Id": "not-a-real-mcp-session",
    },
    toolsListBody("invalid-post"),
  );
  assert(invalidPost.status === 404, `POST invalid session returned ${invalidPost.status}`);

  const missingGet = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "GET",
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: "text/event-stream" },
  });
  assert(missingGet.status === 400, `GET missing session returned ${missingGet.status}`);
  await missingGet.body?.cancel();

  const invalidGet = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "text/event-stream",
      "Mcp-Session-Id": "not-a-real-mcp-session",
    },
  });
  assert(invalidGet.status === 404, `GET invalid session returned ${invalidGet.status}`);
  await invalidGet.body?.cancel();

  const missingDelete = await mcpFetch(port, "DELETE", { Authorization: `Bearer ${TOKEN}` });
  assert(missingDelete.status === 400, `DELETE missing session returned ${missingDelete.status}`);

  const invalidDelete = await mcpFetch(port, "DELETE", {
    Authorization: `Bearer ${TOKEN}`,
    "Mcp-Session-Id": "not-a-real-mcp-session",
  });
  assert(invalidDelete.status === 404, `DELETE invalid session returned ${invalidDelete.status}`);
  pass("HTTP MCP rejects invalid and missing Mcp-Session-Id for POST, GET, and DELETE");

  const rawSessionId = await createRawMcpSession(port);
  await probeSse(port, rawSessionId);
  const deleted = await mcpFetch(port, "DELETE", {
    Authorization: `Bearer ${TOKEN}`,
    "Mcp-Session-Id": rawSessionId,
  });
  assert([200, 202, 204].includes(deleted.status), `valid DELETE returned ${deleted.status}: ${deleted.text}`);
  const afterDelete = await mcpFetch(
    port,
    "POST",
    {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "Mcp-Session-Id": rawSessionId,
    },
    toolsListBody("after-delete"),
  );
  assert(afterDelete.status === 404, `post-delete session reuse returned ${afterDelete.status}`);
  pass("Raw Streamable HTTP initialize, GET/SSE, DELETE, and session cleanup worked", {
    sessionIdLength: rawSessionId.length,
  });
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
      F_MARK_TOKEN: TOKEN,
      NO_COLOR: "1",
    },
  };
}

async function createSessionAndAgent(port, slug, participantId, runtimeId, name) {
  const session = await api(port, "POST", "/sessions", { slug });
  await api(port, "POST", "/participants/register", {
    kind: "agent",
    name,
    suggested_id: participantId,
    runtime_id: runtimeId,
  });
  await api(port, "POST", `/agents/${encodeURIComponent(participantId)}/link`, {
    session_id: session.id,
  });
  return { sessionId: session.id, participantId, runtimeId };
}

async function listEvents(port, sessionId) {
  const body = await api(port, "GET", `/sessions/${encodeURIComponent(sessionId)}/events`);
  return body.events ?? body;
}

async function waitForMarker(port, sessionId, marker, participantId, timeoutMs = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const events = await listEvents(port, sessionId);
    const hit = events.find(
      (event) =>
        event.participant_id === participantId &&
        JSON.stringify(event.payload ?? {}).includes(marker),
    );
    if (hit !== undefined) return { events, hit };
    await sleep(750);
  }
  const events = await listEvents(port, sessionId).catch(() => []);
  throw new Error(`timed out waiting for ${marker}; events=${JSON.stringify(events).slice(0, 3000)}`);
}

function toolText(result) {
  return (result.content ?? [])
    .filter((entry) => entry.type === "text")
    .map((entry) => entry.text)
    .join("\n");
}

function parseToolJson(result) {
  const text = toolText(result);
  assert(result.isError !== true, `tool returned MCP error: ${text}`);
  return JSON.parse(text);
}

async function withHttpMcpClient(port, fn) {
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
  });
  const client = new Client({ name: "fmark-phase22-hot", version: "0.0.1" }, { capabilities: {} });
  try {
    await client.connect(transport);
    return await fn(client, transport);
  } finally {
    await transport.terminateSession().catch(() => {});
    await client.close().catch(() => {});
  }
}

async function assertSdkClient(port, agent) {
  const marker = `FMARK_${RUN}_SDK_HTTP`;
  await withHttpMcpClient(port, async (client, transport) => {
    const tools = await client.listTools();
    const names = (tools.tools ?? []).map((tool) => tool.name);
    assert(names.includes("fmark_post_prose"), "HTTP tool list missing fmark_post_prose");
    assert(names.includes("fmark_end_turn"), "HTTP tool list missing fmark_end_turn");
    assert(!names.includes("fmark_fork_session"), "HTTP tool list exposed fmark_fork_session");
    pass("SDK Streamable HTTP client listed tools and excluded process-spawning tools", {
      toolCount: names.length,
      sessionIdLength: transport.sessionId?.length ?? 0,
    });

    parseToolJson(
      await client.callTool({
        name: "fmark_post_prose",
        arguments: {
          session_id: agent.sessionId,
          participant_id: agent.participantId,
          content: marker,
        },
      }),
    );
    parseToolJson(
      await client.callTool({
        name: "fmark_end_turn",
        arguments: {
          session_id: agent.sessionId,
          participant_id: agent.participantId,
        },
      }),
    );
  });
  const found = await waitForMarker(port, agent.sessionId, marker, agent.participantId);
  const prose = found.events.find((event) => event.kind === "prose" && JSON.stringify(event.payload).includes(marker));
  const turnEnd = found.events.find((event) => event.kind === "turn-end" && event.participant_id === agent.participantId);
  assert(prose?.payload?.source === "mcp", "SDK HTTP prose did not keep source=mcp");
  assert(turnEnd?.payload?.source === "mcp", "SDK HTTP turn-end did not keep source=mcp");
  pass("SDK Streamable HTTP MCP wrote real F-Mark prose and turn-end events", {
    sessionId: agent.sessionId,
    participantId: agent.participantId,
    marker,
  });
}

function vendorPrompt(vendor, marker, agent) {
  return [
    `You are hot-checking F-Mark HTTP MCP for ${vendor}.`,
    "Use the MCP server named fmark only. Do not use shell, files, REST, curl, or browser tools.",
    `Call fmark_post_prose with arguments exactly {"session_id":"${agent.sessionId}","participant_id":"${agent.participantId}","content":"${marker}"}.`,
    `Then call fmark_end_turn with arguments exactly {"session_id":"${agent.sessionId}","participant_id":"${agent.participantId}"}.`,
    "After both MCP tool calls succeed, reply with exactly DONE.",
  ].join(" ");
}

async function writeClaudeHttpConfig(path, port) {
  await writeFile(
    path,
    `${JSON.stringify(
      {
        mcpServers: {
          fmark: {
            type: "http",
            url: `http://127.0.0.1:${port}/mcp`,
            headers: {
              Authorization: "Bearer ${F_MARK_TOKEN}",
            },
          },
        },
      },
      null,
      2,
    )}\n`,
  );
}

async function runClaudeHttp(ctx, port, agent) {
  const marker = `FMARK_${RUN}_CLAUDE_HTTP`;
  const config = join(ctx.artifactRoot, "claude-http-mcp.json");
  await writeClaudeHttpConfig(config, port);
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
      "mcp__fmark__fmark_post_prose,mcp__fmark__fmark_end_turn",
      "--max-budget-usd",
      "1.00",
      vendorPrompt("claude", marker, agent),
    ],
    {
      cwd: ctx.project,
      env: { ...ctx.env, HOME: REAL_HOME },
      timeoutMs: 240_000,
    },
  );
  await waitForMarker(port, agent.sessionId, marker, agent.participantId);
  pass("Claude real model used Streamable HTTP MCP to write a real session event", {
    marker,
    stdoutTail: tail(result.stdout, 1400),
    stderrTail: tail(result.stderr, 1400),
  });
}

async function configureCodexHttp(ctx, port) {
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
      "[mcp_servers.fmark]",
      `url = ${JSON.stringify(`http://127.0.0.1:${port}/mcp`)}`,
      'bearer_token_env_var = "F_MARK_TOKEN"',
      "startup_timeout_sec = 10",
      "tool_timeout_sec = 60",
      "enabled = true",
      "",
    ].join("\n"),
  );
}

async function runCodexHttp(ctx, port, agent) {
  const marker = `FMARK_${RUN}_CODEX_HTTP`;
  await configureCodexHttp(ctx, port);
  const result = await run(
    "codex",
    [
      "exec",
      "--json",
      "-C",
      ctx.project,
      "--skip-git-repo-check",
      "--dangerously-bypass-approvals-and-sandbox",
      vendorPrompt("codex", marker, agent),
    ],
    { cwd: ctx.project, env: ctx.env, timeoutMs: 300_000 },
  );
  await waitForMarker(port, agent.sessionId, marker, agent.participantId);
  pass("Codex real model used Streamable HTTP MCP to write a real session event", {
    marker,
    stdoutTail: tail(result.stdout, 2400),
    stderrTail: tail(result.stderr, 1600),
  });
}

async function configureGeminiHttp(ctx, port) {
  await run(
    "gemini",
    [
      "mcp",
      "add",
      "--scope",
      "user",
      "--transport",
      "http",
      "--trust",
      "--header",
      `Authorization: Bearer ${TOKEN}`,
      "--timeout",
      "60000",
      "fmark",
      `http://127.0.0.1:${port}/mcp`,
    ],
    { cwd: ctx.project, env: ctx.env, timeoutMs: 45_000 },
  );
}

async function runGeminiHttp(ctx, port, agent) {
  const marker = `FMARK_${RUN}_GEMINI_HTTP`;
  await configureGeminiHttp(ctx, port);
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
      vendorPrompt("gemini", marker, agent),
    ],
    { cwd: ctx.project, env: ctx.env, timeoutMs: 300_000 },
  );
  await waitForMarker(port, agent.sessionId, marker, agent.participantId);
  pass("Gemini real model used Streamable HTTP MCP to write a real session event", {
    marker,
    stdoutTail: tail(result.stdout, 2000),
    stderrTail: tail(result.stderr, 1600),
  });
}

async function collectVersions(ctx) {
  const commands = [
    ["claude", ["--version"]],
    ["codex", ["--version"]],
    ["gemini", ["--version"]],
  ];
  for (const [command, args] of commands) {
    try {
      const result = await run(command, args, { cwd: ctx.project, env: ctx.env, timeoutMs: 30_000 });
      report.versions[command] = tail(result.stdout || result.stderr, 400).trim();
    } catch (err) {
      report.versions[command] = `unavailable: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
}

async function walkFiles(root) {
  const out = [];
  async function walk(path) {
    const entryStat = await stat(path);
    if (entryStat.isDirectory()) {
      const entries = await readdir(path);
      for (const entry of entries) await walk(join(path, entry));
      return;
    }
    if (entryStat.isFile()) out.push(path);
  }
  await walk(root);
  return out;
}

async function assertNoProjectConfigToken(project) {
  const files = await walkFiles(project);
  const offenders = [];
  for (const file of files) {
    if (basename(file) === ".token" && file.includes(`${join(".f-mark")}`)) continue;
    const text = await readFile(file, "utf8").catch(() => "");
    if (text.includes(TOKEN)) offenders.push(file);
  }
  assert(offenders.length === 0, `bearer token leaked into project files: ${offenders.join(", ")}`);
  pass("No bearer token was written into project config or project files", {
    scannedFiles: files.length,
  });
}

async function main() {
  let artifactRoot = null;
  let kernel = null;
  try {
    assert(existsSync(DIST_INDEX), "kernel dist is missing; run pnpm -F f-mark build");
    artifactRoot = await mkdtemp(join(tmpdir(), "fmark-mcp-phase22-hot-"));
    report.artifactRoot = artifactRoot;
    const ctx = await makeContext(artifactRoot);
    ctx.artifactRoot = artifactRoot;
    await collectVersions(ctx);
    const port = await freePort();
    kernel = await startKernel(ctx.project, port, ctx.env);

    await assertProtocolEdges(port);

    const sdkAgent = await createSessionAndAgent(
      port,
      `${RUN}-sdk-http`,
      "ag-p22-sdk",
      "codex",
      "Phase22 SDK HTTP Agent",
    );
    await assertSdkClient(port, sdkAgent);

    const claudeAgent = await createSessionAndAgent(
      port,
      `${RUN}-claude-http`,
      "ag-p22-claude",
      "claude",
      "Phase22 Claude HTTP Agent",
    );
    await runClaudeHttp(ctx, port, claudeAgent);

    const codexAgent = await createSessionAndAgent(
      port,
      `${RUN}-codex-http`,
      "ag-p22-codex",
      "codex",
      "Phase22 Codex HTTP Agent",
    );
    await runCodexHttp(ctx, port, codexAgent);

    const geminiAgent = await createSessionAndAgent(
      port,
      `${RUN}-gemini-http`,
      "ag-p22-gemini",
      "gemini",
      "Phase22 Gemini HTTP Agent",
    );
    await runGeminiHttp(ctx, port, geminiAgent);

    await assertNoProjectConfigToken(ctx.project);
    report.kernelLogsTail = kernel.logs();
    const reportPath = join(artifactRoot, "report.json");
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`HOT_TEST_REPORT ${reportPath}`);
  } catch (err) {
    if (artifactRoot !== null) {
      report.error = redact(err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err));
      if (kernel !== null) report.kernelLogsTail = kernel.logs();
      const reportPath = join(artifactRoot, "report.json");
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`).catch(() => {});
      console.error(`HOT_TEST_REPORT ${reportPath}`);
    }
    throw err;
  } finally {
    await kernel?.stop().catch(() => {});
  }
}

await main();
