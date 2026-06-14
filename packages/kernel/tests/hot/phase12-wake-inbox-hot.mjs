#!/usr/bin/env node
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
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const WORKSPACE = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const DIST_INDEX = join(WORKSPACE, "packages/kernel/dist/index.js");
const RUN = `phase12-${Date.now().toString(36)}`;
const TOKEN = `${RUN}-token`;

if (process.env.FMARK_HOT !== "1") {
  console.error("Set FMARK_HOT=1 to run Phase 12 wake/inbox hot checks.");
  process.exit(1);
}

const report = { run: RUN, artifactRoot: null, checks: [] };

function pass(name, detail = {}) {
  report.checks.push({ name, status: "PASS", ...detail });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function redact(text) {
  return text.replaceAll(TOKEN, "<redacted-token>");
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = execFile(
      command,
      args,
      {
        cwd: options.cwd,
        env: options.env,
        timeout: options.timeoutMs ?? 25_000,
        maxBuffer: 1024 * 1024 * 2,
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
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
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
  let parsed = text;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (!res.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} failed ${res.status}: ${text}`);
  }
  return parsed;
}

async function makeContext(artifactRoot) {
  const project = join(artifactRoot, "project");
  const home = join(artifactRoot, "home");
  const xdg = join(artifactRoot, "xdg");
  const codexHome = join(home, ".codex");
  const tmuxTmp = join(artifactRoot, "tmux");
  const captureDir = join(artifactRoot, "captures");
  await mkdir(project, { recursive: true });
  await mkdir(home, { recursive: true });
  await mkdir(xdg, { recursive: true });
  await mkdir(codexHome, { recursive: true });
  await mkdir(tmuxTmp, { recursive: true, mode: 0o700 });
  await mkdir(captureDir, { recursive: true });
  const captureRuntime = join(artifactRoot, "capture-runtime");
  await writeFile(
    captureRuntime,
    [
      "#!/bin/sh",
      'mkdir -p "$FMARK_CAPTURE_DIR"',
      'cat >> "$FMARK_CAPTURE_DIR/${F_MARK_AGENT_ID:-unknown}.txt"',
      "",
    ].join("\n"),
  );
  await chmod(captureRuntime, 0o755);
  return {
    project,
    home,
    xdg,
    codexHome,
    tmuxTmp,
    captureDir,
    captureRuntime,
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

async function createSession(port) {
  const session = await http(port, "/sessions", {
    method: "POST",
    body: JSON.stringify({ slug: `${RUN}-wake` }),
  });
  return session.id;
}

async function upsertCaptureRuntime(port, ctx) {
  await http(port, "/runtimes/capture", {
    method: "PUT",
    body: JSON.stringify({
      displayName: "Capture Runtime",
      executable: ctx.captureRuntime,
      args: [],
      env: { FMARK_CAPTURE_DIR: ctx.captureDir },
      readyDelayMs: 0,
    }),
  });
}

async function spawnCaptureAgent(port, sessionId, participantId) {
  return http(port, "/managed-agents/spawn", {
    method: "POST",
    body: JSON.stringify({
      runtime_id: "capture",
      session_id: sessionId,
      suggested_participant_id: participantId,
    }),
  });
}

async function waitForCaptureContains(ctx, participantId, needles, timeoutMs = 15_000) {
  const capturePath = join(ctx.captureDir, `${participantId}.txt`);
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const text = await readFile(capturePath, "utf8");
      if (needles.every((needle) => text.includes(needle))) return text;
    } catch {
      // keep polling
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`timed out waiting for ${capturePath} to contain ${needles.join(", ")}`);
}

async function defaultUserId(port) {
  const roster = await http(port, "/participants");
  const entries = Object.entries(roster.participants ?? {});
  const found = entries.find(([, participant]) => participant.kind === "user");
  assert(found !== undefined, "default user participant not found");
  return found[0];
}

async function registerLinkedAgent(port, sessionId, participantId, runtimeId) {
  await http(port, "/participants/register", {
    method: "POST",
    body: JSON.stringify({
      kind: "agent",
      name: `Phase 12 ${runtimeId}`,
      suggested_id: participantId,
    }),
  });
  await http(port, `/agents/${encodeURIComponent(participantId)}/link`, {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId }),
  });
  return { participantId, sessionId, runtimeId };
}

async function waitForSessionMarker(port, sessionId, marker, timeoutMs = 45_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const body = await http(port, `/sessions/${encodeURIComponent(sessionId)}/events`);
    if (JSON.stringify(body).includes(marker)) return body;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw new Error(`timed out waiting for marker ${marker} in session ${sessionId}`);
}

async function deleteAgent(port, participantId) {
  const token = await http(
    port,
    `/managed-agents/${encodeURIComponent(participantId)}/confirm-token`,
  );
  await http(
    port,
    `/managed-agents/${encodeURIComponent(participantId)}?confirm=${encodeURIComponent(token.token)}`,
    { method: "DELETE" },
  );
}

function mcpEnv(baseEnv, project, sessionId, participantId) {
  return {
    ...baseEnv,
    F_MARK_PATH: project,
    F_MARK_SESSION_ID: sessionId,
    F_MARK_AGENT_ID: participantId,
    F_MARK_RUNTIME_ID: "capture",
  };
}

async function copyIfExists(from, to) {
  if (!existsSync(from)) return false;
  await mkdir(join(to, ".."), { recursive: true });
  await copyFile(from, to);
  return true;
}

async function prepareCodexHome(ctx) {
  await mkdir(ctx.codexHome, { recursive: true });
  await copyIfExists(join(process.env.HOME, ".codex/auth.json"), join(ctx.codexHome, "auth.json"));
  await copyIfExists(join(process.env.HOME, ".codex/installation_id"), join(ctx.codexHome, "installation_id"));
}

async function prepareGeminiHome(ctx) {
  const geminiHome = join(ctx.home, ".gemini");
  await mkdir(geminiHome, { recursive: true });
  for (const file of ["settings.json", "oauth_creds.json", "google_accounts.json", "installation_id"]) {
    await copyIfExists(join(process.env.HOME, ".gemini", file), join(geminiHome, file));
  }
  await writeFile(
    join(geminiHome, "trustedFolders.json"),
    JSON.stringify({ [ctx.project]: "TRUST_FOLDER" }, null, 2),
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

function vendorInboxPrompt(vendor, inboxMarker, ackMarker) {
  return [
    `You are hot-testing F-Mark MCP inbox for ${vendor}.`,
    "Use MCP server fmark only. Do not use curl, shell, files, or REST.",
    "First call fmark_get_inbox with arguments exactly {}.",
    `Only if that inbox result contains ${inboxMarker}, call fmark_post_prose with arguments exactly {"content":"${ackMarker}"}.`,
    "Then call fmark_end_turn with arguments exactly {}.",
    "After the MCP calls succeed, reply with exactly DONE.",
  ].join(" ");
}

async function withMcpClient(project, env, fn) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [DIST_INDEX, "mcp", "--path", project],
    cwd: project,
    env,
    stderr: "pipe",
  });
  const client = new Client({ name: "fmark-phase12-hot", version: "0.0.1" }, { capabilities: {} });
  try {
    await client.connect(transport);
    return await fn(client);
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

function parseToolJson(result) {
  const text = toolText(result);
  assert(result.isError !== true, `tool returned MCP error: ${text}`);
  return JSON.parse(text);
}

async function postInboxMarker(port, sessionId, userId, marker) {
  await http(port, `/sessions/${encodeURIComponent(sessionId)}/events/prose`, {
    method: "POST",
    body: JSON.stringify({
      participant_id: userId,
      content: marker,
    }),
  });
}

async function assertVendorConsumedInbox(port, sessionId, participantId, marker) {
  const inbox = await http(
    port,
    `/sessions/${encodeURIComponent(sessionId)}/inbox?participant_id=${encodeURIComponent(participantId)}`,
  );
  assert(
    !JSON.stringify(inbox.events ?? []).includes(marker),
    `${participantId} left inbox marker unread after vendor run`,
  );
}

async function runClaudeInboxAgent(ctx, port, sessionId, userId) {
  const participantId = "ag-p12-claude";
  const agent = await registerLinkedAgent(port, sessionId, participantId, "claude");
  const inboxMarker = `FMARK_${RUN}_CLAUDE_INBOX`;
  const ackMarker = `FMARK_${RUN}_CLAUDE_ACK`;
  await postInboxMarker(port, sessionId, userId, inboxMarker);
  const config = join(ctx.project, "claude-mcp-phase12.json");
  await writeClaudeMcpConfig(config, ctx.project, agent);
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
      "mcp__fmark__fmark_get_inbox,mcp__fmark__fmark_post_prose,mcp__fmark__fmark_end_turn",
      "--max-budget-usd",
      "1.00",
      vendorInboxPrompt("claude", inboxMarker, ackMarker),
    ],
    { cwd: ctx.project, env: { ...process.env, NO_COLOR: "1" }, timeoutMs: 180_000 },
  );
  await waitForSessionMarker(port, sessionId, ackMarker);
  await assertVendorConsumedInbox(port, sessionId, participantId, inboxMarker);
  pass("Claude real model MCP inbox cursor", {
    sessionId,
    participantId,
    stdout: redact(result.stdout).slice(-1200),
  });
}

async function runCodexInboxAgent(ctx, port, sessionId, userId) {
  await prepareCodexHome(ctx);
  const participantId = "ag-p12-codex";
  const agent = await registerLinkedAgent(port, sessionId, participantId, "codex");
  const inboxMarker = `FMARK_${RUN}_CODEX_INBOX`;
  const ackMarker = `FMARK_${RUN}_CODEX_ACK`;
  await postInboxMarker(port, sessionId, userId, inboxMarker);
  await configureCodexMcp(ctx.project, ctx.env, agent);
  const result = await run(
    "codex",
    [
      "exec",
      "--json",
      "-C",
      ctx.project,
      "--skip-git-repo-check",
      "--dangerously-bypass-approvals-and-sandbox",
      vendorInboxPrompt("codex", inboxMarker, ackMarker),
    ],
    { cwd: ctx.project, env: ctx.env, timeoutMs: 240_000 },
  );
  await waitForSessionMarker(port, sessionId, ackMarker);
  await assertVendorConsumedInbox(port, sessionId, participantId, inboxMarker);
  pass("Codex real model MCP inbox cursor", {
    sessionId,
    participantId,
    stdout: redact(result.stdout).slice(-1200),
  });
}

async function runGeminiInboxAgent(ctx, port, sessionId, userId) {
  await prepareGeminiHome(ctx);
  const participantId = "ag-p12-gemini";
  const agent = await registerLinkedAgent(port, sessionId, participantId, "gemini");
  const inboxMarker = `FMARK_${RUN}_GEMINI_INBOX`;
  const ackMarker = `FMARK_${RUN}_GEMINI_ACK`;
  await postInboxMarker(port, sessionId, userId, inboxMarker);
  await configureGeminiMcp(ctx.project, ctx.env, agent);
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
      vendorInboxPrompt("gemini", inboxMarker, ackMarker),
    ],
    { cwd: ctx.project, env: ctx.env, timeoutMs: 240_000 },
  );
  await waitForSessionMarker(port, sessionId, ackMarker);
  await assertVendorConsumedInbox(port, sessionId, participantId, inboxMarker);
  pass("Gemini real model MCP inbox cursor", {
    sessionId,
    participantId,
    stdout: redact(result.stdout).slice(-1200),
  });
}

async function wakeInboxCase(artifactRoot) {
  const ctx = await makeContext(artifactRoot);
  const port = 9900 + Math.floor(Math.random() * 500);
  let kernel = null;
  const agentA = "ag-p12-a";
  const agentB = "ag-p12-b";
  try {
    kernel = await startKernel(ctx.project, port, ctx.env);
    await upsertCaptureRuntime(port, ctx);
    const sessionId = await createSession(port);
    const spawnedA = await spawnCaptureAgent(port, sessionId, agentA);
    const spawnedB = await spawnCaptureAgent(port, sessionId, agentB);
    await waitForCaptureContains(ctx, agentA, ["# F-Mark agent onboarding", sessionId, agentA]);
    await waitForCaptureContains(ctx, agentB, ["# F-Mark agent onboarding", sessionId, agentB]);

    const marker = `FMARK_${RUN}_WAKE_DELTA`;
    const userId = await defaultUserId(port);
    const prose = await http(port, `/sessions/${encodeURIComponent(sessionId)}/events/prose`, {
      method: "POST",
      body: JSON.stringify({
        participant_id: userId,
        content: marker,
      }),
    });

    const wake = await http(port, `/sessions/${encodeURIComponent(sessionId)}/wake`, {
      method: "POST",
      body: JSON.stringify({ reason: "user-message" }),
    });
    assert(wake.notified.includes(agentA), "wake did not notify agent A");
    assert(wake.notified.includes(agentB), "wake did not notify agent B");
    assert(wake.delivered.length === 2, `expected 2 delivered agents, got ${wake.delivered.length}`);
    assert(
      wake.delivered.every((agent) => agent.event_count >= 1),
      "wake packet delivery reported no unread events",
    );

    const textA = await waitForCaptureContains(ctx, agentA, [
      "# F-Mark wake packet",
      "fmark_get_inbox",
      marker,
      prose.filename,
    ]);
    const textB = await waitForCaptureContains(ctx, agentB, [
      "# F-Mark wake packet",
      "fmark_get_inbox",
      marker,
      prose.filename,
    ]);

    await withMcpClient(ctx.project, mcpEnv(ctx.env, ctx.project, sessionId, agentA), async (client) => {
      const tools = await client.listTools();
      const toolNames = new Set(tools.tools.map((tool) => tool.name));
      assert(toolNames.has("fmark_get_inbox"), "MCP tool fmark_get_inbox missing");
      assert(toolNames.has("fmark_mark_seen"), "MCP tool fmark_mark_seen missing");

      const first = parseToolJson(await client.callTool({
        name: "fmark_get_inbox",
        arguments: {},
      }));
      assert(first.session_id === sessionId, "inbox returned wrong session id");
      assert(first.participant_id === agentA, "inbox returned wrong participant id");
      assert(first.cursor_before === null, "first inbox cursor_before was not null");
      assert(first.cursor_after !== null, "first inbox did not advance cursor");
      assert(JSON.stringify(first.events).includes(marker), "first inbox missing user prose marker");

      const second = parseToolJson(await client.callTool({
        name: "fmark_get_inbox",
        arguments: {},
      }));
      assert(second.events.length === 0, `second inbox was not empty: ${JSON.stringify(second.events)}`);
      assert(second.cursor_before === first.cursor_after, "second inbox cursor did not start at first cursor_after");

      const resource = await client.readResource({ uri: "fmark://inbox" });
      const resourceText = (resource.contents ?? []).map((entry) => entry.text ?? "").join("\n");
      assert(resourceText.includes(agentA), "fmark://inbox did not resolve for agent A");
    });

    await withMcpClient(ctx.project, mcpEnv(ctx.env, ctx.project, sessionId, agentB), async (client) => {
      const seen = parseToolJson(await client.callTool({
        name: "fmark_mark_seen",
        arguments: {},
      }));
      assert(seen.participant_id === agentB, "mark_seen returned wrong participant id");
      assert(seen.cursor !== null, "mark_seen did not set a cursor");
      const inbox = parseToolJson(await client.callTool({
        name: "fmark_get_inbox",
        arguments: {},
      }));
      assert(inbox.events.length === 0, "agent B inbox was not empty after mark_seen");
    });

    const targetMarker = `FMARK_${RUN}_TARGETED_WAKE`;
    await http(port, `/sessions/${encodeURIComponent(sessionId)}/events/prose`, {
      method: "POST",
      body: JSON.stringify({
        participant_id: userId,
        content: targetMarker,
      }),
    });
    const targetedWake = await http(port, `/sessions/${encodeURIComponent(sessionId)}/wake`, {
      method: "POST",
      body: JSON.stringify({
        reason: "mention",
        target_participant_ids: [agentA, "bad-target", "ag-p12-z"],
      }),
    });
    assert(
      targetedWake.notified.length === 1 && targetedWake.notified[0] === agentA,
      `targeted wake notified wrong agents: ${JSON.stringify(targetedWake.notified)}`,
    );
    assert(
      targetedWake.skipped.some((entry) => entry.reason === "invalid-target"),
      "targeted wake did not report invalid target",
    );
    assert(
      targetedWake.skipped.some((entry) => entry.reason === "not-managed"),
      "targeted wake did not report unmanaged target",
    );
    await waitForCaptureContains(ctx, agentA, [targetMarker]);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
    const bAfterTarget = await readFile(join(ctx.captureDir, `${agentB}.txt`), "utf8");
    assert(!bAfterTarget.includes(targetMarker), "agent B received targeted wake meant for agent A");

    await run("tmux", ["kill-session", "-t", spawnedB.tmux_session], {
      cwd: ctx.project,
      env: ctx.env,
    });
    const deadMarker = `FMARK_${RUN}_DEAD_SKIP`;
    await http(port, `/sessions/${encodeURIComponent(sessionId)}/events/prose`, {
      method: "POST",
      body: JSON.stringify({
        participant_id: userId,
        content: deadMarker,
      }),
    });
    const deadWake = await http(port, `/sessions/${encodeURIComponent(sessionId)}/wake`, {
      method: "POST",
      body: JSON.stringify({ reason: "user-message" }),
    });
    assert(deadWake.notified.includes(agentA), "dead-pane wake did not still notify live agent A");
    assert(
      deadWake.skipped.some((entry) => entry.participant_id === agentB && entry.reason === "pane-dead"),
      "dead-pane wake did not report agent B as pane-dead",
    );
    await waitForCaptureContains(ctx, agentA, [deadMarker]);

    await deleteAgent(port, agentA);
    await deleteAgent(port, agentB);
    pass("real tmux wake packet and MCP inbox cursor flow", {
      sessionId,
      agents: [agentA, agentB],
      tmuxSessions: [spawnedA.tmux_session, spawnedB.tmux_session],
      captureBytes: { [agentA]: textA.length, [agentB]: textB.length },
      targetedWake: targetedWake.notified,
      deadPaneSkipped: true,
    });

    await runClaudeInboxAgent(ctx, port, sessionId, userId);
    await runCodexInboxAgent(ctx, port, sessionId, userId);
    await runGeminiInboxAgent(ctx, port, sessionId, userId);
  } finally {
    if (kernel !== null) await kernel.stop();
    try {
      await run("tmux", ["kill-server"], { cwd: ctx.project, env: ctx.env, timeoutMs: 5_000 });
    } catch {
      // The isolated tmux server may already be gone.
    }
  }
}

async function main() {
  const artifactRoot = await mkdtemp(join(tmpdir(), "fmark-mcp-phase12-hot-"));
  report.artifactRoot = artifactRoot;
  try {
    await wakeInboxCase(artifactRoot);
    await writeFile(join(artifactRoot, "report.json"), JSON.stringify(report, null, 2));
    console.log(`HOT_TEST_REPORT ${join(artifactRoot, "report.json")}`);
    console.log(JSON.stringify({ run: RUN, artifactRoot, passes: report.checks.length }, null, 2));
  } catch (error) {
    report.checks.push({
      name: "Phase 12 wake/inbox hot runner",
      status: "FAIL",
      error: error instanceof Error ? error.message : String(error),
    });
    await writeFile(join(artifactRoot, "report.failed.json"), JSON.stringify(report, null, 2));
    console.error(`HOT_TEST_FAILED_REPORT ${join(artifactRoot, "report.failed.json")}`);
    throw error;
  } finally {
    if (process.env.FMARK_HOT_KEEP !== "1") {
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
