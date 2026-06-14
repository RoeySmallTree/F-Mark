#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const WORKSPACE = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const DIST_INDEX = join(WORKSPACE, "packages/kernel/dist/index.js");
const RUN = `phase21-${Date.now().toString(36)}`;
const TOKEN = `${RUN}-token`;

if (process.env.FMARK_HOT !== "1") {
  console.error("Set FMARK_HOT=1 to run Phase 21 hybrid dedupe hot checks.");
  process.exit(1);
}

const report = { run: RUN, artifactRoot: null, checks: [] };

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
        timeout: options.timeoutMs ?? 35_000,
        maxBuffer: 1024 * 1024 * 4,
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
    child.stdin?.end(options.input ?? "");
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

async function createSessionAndAgent(port, slug, participantId) {
  const session = await api(port, "POST", "/sessions", { slug });
  await api(port, "POST", "/participants/register", {
    kind: "agent",
    name: "Phase21 Hybrid Agent",
    suggested_id: participantId,
    runtime_id: "codex",
  });
  await api(port, "POST", `/agents/${encodeURIComponent(participantId)}/link`, {
    session_id: session.id,
  });
  return { sessionId: session.id, participantId };
}

async function withMcpClient(project, env, agent, fn) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [DIST_INDEX, "mcp", "--path", project],
    cwd: project,
    env: {
      ...env,
      F_MARK_PATH: project,
      F_MARK_AGENT_ID: agent.participantId,
      F_MARK_SESSION_ID: agent.sessionId,
      F_MARK_RUNTIME_ID: "codex",
    },
    stderr: "pipe",
  });
  const client = new Client({ name: "fmark-phase21-hot", version: "0.0.1" }, { capabilities: {} });
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

async function writeTranscript(path, lines) {
  await writeFile(path, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`, "utf8");
}

async function runHook(project, env, agent, transcript, finalText) {
  const payload = {
    cwd: project,
    hook_event_name: "Stop",
    session_id: `runtime-${agent.sessionId}`,
    turn_id: `turn-${agent.sessionId}`,
    transcript_path: transcript,
  };
  await run(process.execPath, [DIST_INDEX, "hook", "auto-stream", agent.participantId], {
    cwd: project,
    env: {
      ...env,
      F_MARK_PATH: project,
      F_MARK_AGENT_ID: agent.participantId,
      F_MARK_RUNTIME_ID: "codex",
      F_MARK_SESSION_ID: agent.sessionId,
    },
    input: `${JSON.stringify(payload)}\n`,
  });
}

async function listEvents(port, sessionId) {
  const body = await api(port, "GET", `/sessions/${encodeURIComponent(sessionId)}/events`);
  return body.events ?? body;
}

async function main() {
  let artifactRoot = null;
  let kernel = null;
  try {
    assert(existsSync(DIST_INDEX), "kernel dist is missing; run pnpm -F f-mark build");
    artifactRoot = await mkdtemp(join(tmpdir(), "fmark-mcp-phase21-hot-"));
    report.artifactRoot = artifactRoot;
    const project = join(artifactRoot, "project");
    const home = join(artifactRoot, "home");
    const xdg = join(artifactRoot, "xdg");
    await mkdir(project, { recursive: true });
    await mkdir(home, { recursive: true });
    await mkdir(xdg, { recursive: true });
    const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: xdg, NO_COLOR: "1" };
    const port = await freePort();
    kernel = await startKernel(project, port, env);

    const agent = await createSessionAndAgent(port, `${RUN}-dedupe`, "ag-p21");
    const marker = `PHASE21_MCP_FINAL_${RUN}`;
    await withMcpClient(project, env, agent, async (client) => {
      parseToolJson(await client.callTool({
        name: "fmark_post_prose",
        arguments: { content: marker },
      }));
      parseToolJson(await client.callTool({
        name: "fmark_end_turn",
        arguments: {},
      }));
    });

    const transcript = join(artifactRoot, "hook-duplicate.jsonl");
    await writeTranscript(transcript, [
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "tu-phase21-read",
            name: "Read",
            input: { file_path: "notes.md" },
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tu-phase21-read",
            content: "PHASE21_TOOL_RESULT_KEPT",
          },
        ],
      },
      {
        role: "assistant",
        content: [{ type: "text", text: marker }],
      },
    ]);
    await runHook(project, env, agent, transcript, marker);
    const events = await listEvents(port, agent.sessionId);
    const finalProse = events.filter(
      (event) =>
        event.kind === "prose" &&
        event.participant_id === agent.participantId &&
        event.payload.content.trim() === marker,
    );
    const turnEnds = events.filter(
      (event) => event.kind === "turn-end" && event.participant_id === agent.participantId,
    );
    const toolUses = events.filter(
      (event) =>
        event.kind === "tool-use" &&
        event.participant_id === agent.participantId &&
        JSON.stringify(event.payload).includes("PHASE21_TOOL_RESULT_KEPT"),
    );
    assert(finalProse.length === 1, `expected one final prose, got ${finalProse.length}`);
    assert(finalProse[0].payload.source === "mcp", "final prose did not retain source=mcp");
    assert(turnEnds.length === 1, `expected one turn-end, got ${turnEnds.length}`);
    assert(turnEnds[0].payload.source === "mcp", "turn-end did not retain source=mcp");
    assert(toolUses.length === 1, "hook tool-use was incorrectly deduped");
    pass("MCP final prose dedupes matching hook final while preserving tool-use", {
      sessionId: agent.sessionId,
      finalProse: finalProse[0].filename,
      turnEnd: turnEnds[0].filename,
      toolUse: toolUses[0].filename,
    });

    const second = await createSessionAndAgent(port, `${RUN}-different-final`, "ag-p21b");
    await withMcpClient(project, env, second, async (client) => {
      parseToolJson(await client.callTool({
        name: "fmark_post_prose",
        arguments: { content: `MCP_ONLY_${RUN}` },
      }));
    });
    const secondTranscript = join(artifactRoot, "hook-different.jsonl");
    await writeTranscript(secondTranscript, [
      {
        role: "assistant",
        content: [{ type: "text", text: `HOOK_DIFFERENT_${RUN}` }],
      },
    ]);
    await runHook(project, env, second, secondTranscript, `HOOK_DIFFERENT_${RUN}`);
    const secondEvents = await listEvents(port, second.sessionId);
    assert(
      secondEvents.some(
        (event) =>
          event.kind === "prose" &&
          event.payload.source === "hook" &&
          event.payload.content.includes(`HOOK_DIFFERENT_${RUN}`),
      ),
      "different hook final was incorrectly deduped",
    );
    pass("different hook final prose is still captured", {
      sessionId: second.sessionId,
      totalEvents: secondEvents.length,
    });

    const reportPath = join(artifactRoot, "report.json");
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`HOT_TEST_REPORT ${reportPath}`);
  } catch (err) {
    report.error = err instanceof Error ? err.message : String(err);
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
