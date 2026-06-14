#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const WORKSPACE = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const DIST_INDEX = join(WORKSPACE, "packages/kernel/dist/index.js");
const RUN = `phase17-${Date.now().toString(36)}`;
const TOKEN = `${RUN}-token`;

if (process.env.FMARK_HOT !== "1") {
  console.error("Set FMARK_HOT=1 to run Phase 17 session fork hot checks.");
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
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk.toString()));
  child.stderr.on("data", (chunk) => stderr.push(chunk.toString()));
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
      return redact(`${stdout.join("")}\n${stderr.join("")}`).slice(-4000);
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
      name: `Phase 17 ${participantId}`,
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

function mcpEnv(baseEnv, project, participantId, sessionId) {
  return {
    ...baseEnv,
    F_MARK_PATH: project,
    F_MARK_AGENT_ID: participantId,
    F_MARK_RUNTIME_ID: "capture",
    ...(sessionId !== undefined ? { F_MARK_SESSION_ID: sessionId } : {}),
  };
}

async function withMcpClient(project, env, fn) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [DIST_INDEX, "mcp", "--path", project],
    cwd: project,
    env,
    stderr: "pipe",
  });
  const client = new Client({ name: "fmark-phase17-hot", version: "0.0.1" }, { capabilities: {} });
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

async function createSourceEvents(ctx, sourceSessionId, liveAgentId) {
  const marker = `FMARK_${RUN}_SOURCE`;
  await withMcpClient(
    ctx.project,
    mcpEnv(ctx.env, ctx.project, liveAgentId, sourceSessionId),
    async (client) => {
      const tools = await client.listTools();
      const names = new Set(tools.tools.map((tool) => tool.name));
      for (const name of [
        "fmark_fork_session",
        "fmark_post_prose",
        "fmark_post_todo",
        "fmark_post_html",
        "fmark_post_flow",
        "fmark_post_file_ref",
      ]) {
        assert(names.has(name), `missing MCP tool ${name}`);
      }
      parseToolJson(await client.callTool({
        name: "fmark_post_prose",
        arguments: { content: `${marker}_PROSE`, name: "Phase 17 Source Anchor" },
      }));
      parseToolJson(await client.callTool({
        name: "fmark_post_todo",
        arguments: {
          id: "todo-p17-source",
          title: "Phase 17 source todo",
          status: "open",
          assigned_to: liveAgentId,
          body: `${marker}_TODO`,
        },
      }));
      parseToolJson(await client.callTool({
        name: "fmark_post_html",
        arguments: {
          title: "Phase 17 source HTML",
          html: `<main data-marker="${marker}_HTML">phase 17 html</main>`,
          css: "main { color: #123456; }",
          js: "window.__phase17 = true;",
        },
      }));
      parseToolJson(await client.callTool({
        name: "fmark_post_flow",
        arguments: {
          id: "flow-p17-source",
          title: "Phase 17 source flow",
          nodes: [
            { id: "n1", label: "Source" },
            { id: "n2", label: "Fork" },
          ],
          edges: [{ id: "e1", source: "n1", target: "n2" }],
        },
      }));
      parseToolJson(await client.callTool({
        name: "fmark_post_file_ref",
        arguments: {
          id: "file-p17-source",
          path: "artifacts/phase17-source.txt",
          mime_type: "text/plain",
          description: `${marker}_FILE`,
        },
      }));
    },
  );
  pass("MCP seeded source session with prose/todo/html/flow/file events", {
    sourceSessionId,
    marker,
  });
  return marker;
}

async function snapshotTree(root, options = {}) {
  const entries = {};
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      const rel = relative(root, abs).split("\\").join("/");
      if (options.exclude?.(rel, entry) === true) continue;
      if (entry.isDirectory()) {
        entries[`${rel}/`] = { type: "dir" };
        await walk(abs);
      } else if (entry.isFile()) {
        const buf = await readFile(abs);
        entries[rel] = {
          type: "file",
          bytes: buf.length,
          sha256: createHash("sha256").update(buf).digest("hex"),
        };
      } else {
        entries[rel] = { type: "other" };
      }
    }
  }
  await walk(root);
  return entries;
}

function diffSnapshots(left, right) {
  const out = [];
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of [...keys].sort()) {
    const l = left[key];
    const r = right[key];
    if (l === undefined) {
      out.push({ path: key, difference: "missing-left" });
    } else if (r === undefined) {
      out.push({ path: key, difference: "missing-right" });
    } else if (JSON.stringify(l) !== JSON.stringify(r)) {
      out.push({ path: key, difference: "changed", left: l, right: r });
    }
  }
  return out;
}

function assertSnapshotsEqual(left, right, label) {
  const diff = diffSnapshots(left, right);
  assert(diff.length === 0, `${label} tree mismatch: ${JSON.stringify(diff.slice(0, 10))}`);
}

async function waitForSessionMarker(port, sessionId, marker, timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const body = await http(port, `/sessions/${encodeURIComponent(sessionId)}/events`);
    if (JSON.stringify(body).includes(marker)) return body;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error(`timed out waiting for marker ${marker} in ${sessionId}`);
}

async function assertNoSessionMarker(port, sessionId, marker) {
  const body = await http(port, `/sessions/${encodeURIComponent(sessionId)}/events`);
  assert(!JSON.stringify(body).includes(marker), `${sessionId} unexpectedly contains ${marker}`);
}

async function openWs(port) {
  const messages = [];
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${encodeURIComponent(TOKEN)}`);
  ws.onmessage = (event) => messages.push(String(event.data));
  await new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error("ws open timeout")), 5_000);
    ws.onopen = () => {
      clearTimeout(timer);
      resolvePromise();
    };
    ws.onerror = () => reject(new Error("ws error before open"));
  });
  return { ws, messages };
}

async function waitForMessage(messages, predicate, label, timeoutMs = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    for (const message of messages) {
      let parsed;
      try {
        parsed = JSON.parse(message);
      } catch {
        continue;
      }
      if (predicate(parsed)) return parsed;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`timed out waiting for websocket message: ${label}`);
}

async function assertAgentSessions(port, sourceSessionId, forkSessionId, ids) {
  const participants = await http(port, "/participants");
  const rows = await http(port, "/managed-agents/status");
  const byId = Object.fromEntries((rows.agents ?? []).map((agent) => [agent.participant_id, agent]));

  assert(
    participants.participants?.[ids.live]?.active_session === forkSessionId,
    "live agent participant was not rebound to fork",
  );
  assert(
    participants.participants?.[ids.paused]?.active_session === sourceSessionId,
    "paused agent participant should remain on source",
  );
  assert(
    participants.participants?.[ids.detached]?.active_session === sourceSessionId,
    "detached agent participant should remain on source",
  );
  assert(
    byId[ids.live]?.active_session === forkSessionId &&
      byId[ids.live]?.runtime_session?.desired_name === forkSessionId,
    "managed status did not reflect live agent fork handoff",
  );
  assert(byId[ids.paused]?.paused === true, "paused agent did not remain paused");
  pass("managed agent state rebound only connected active agent", {
    live: byId[ids.live]?.active_session,
    paused: byId[ids.paused]?.active_session,
    detached: byId[ids.detached]?.active_session,
  });
}

async function runMcpPostAfterHandoff(ctx, port, sourceSessionId, forkSessionId, liveAgentId) {
  const marker = `FMARK_${RUN}_MCP_AFTER_HANDOFF`;
  await withMcpClient(
    ctx.project,
    mcpEnv(ctx.env, ctx.project, liveAgentId),
    async (client) => {
      const written = parseToolJson(await client.callTool({
        name: "fmark_post_prose",
        arguments: { content: marker },
      }));
      assert(written.kind === "prose", "post-handoff MCP write did not return prose");
      const read = parseToolJson(await client.callTool({
        name: "fmark_read_events",
        arguments: {},
      }));
      assert(read.events.some((event) => JSON.stringify(event).includes(marker)), "active MCP read missed marker");
    },
  );
  await waitForSessionMarker(port, forkSessionId, marker);
  await assertNoSessionMarker(port, sourceSessionId, marker);
  pass("MCP write without session_id followed fork handoff", {
    sourceSessionId,
    forkSessionId,
    liveAgentId,
    marker,
  });
  return marker;
}

async function runMcpForkToolCase(ctx, port, sourceSessionId, liveAgentId) {
  const forkName = `${RUN}-mcp-tool`;
  const result = await withMcpClient(
    ctx.project,
    mcpEnv(ctx.env, ctx.project, liveAgentId),
    async (client) =>
      parseToolJson(await client.callTool({
        name: "fmark_fork_session",
        arguments: {
          session_id: sourceSessionId,
          name: forkName,
          relaunch_agents: false,
        },
      })),
  );
  assert(result.source_session_id === sourceSessionId, "MCP fork tool returned wrong source");
  assert(result.session?.id !== undefined && result.session.id !== sourceSessionId, "MCP fork tool did not create fork");
  assert(result.agents.every((agent) => agent.status === "skipped-detached"), "MCP no-relaunch fork returned unexpected agent status");
  const metadataText = await readFile(join(ctx.project, ".f-mark/sessions", result.session.id, ".fork.json"), "utf8");
  const metadata = JSON.parse(metadataText);
  assert(metadata.source_session_id === sourceSessionId, "MCP fork metadata source mismatch");
  pass("MCP fmark_fork_session created no-relaunch fork", {
    sourceSessionId,
    forkSessionId: result.session.id,
    copiedEntries: result.copied_entries,
  });
}

async function phase17Case(artifactRoot) {
  const ctx = await makeContext(artifactRoot);
  const port = 10050 + Math.floor(Math.random() * 400);
  let kernel = null;
  const ids = {
    live: "ag-p17-live",
    paused: "ag-p17-pause",
    detached: "ag-p17-dead",
  };
  try {
    kernel = await startKernel(ctx.project, port, ctx.env);
    await upsertCaptureRuntime(port, ctx);
    const source = await http(port, "/sessions", {
      method: "POST",
      body: JSON.stringify({ slug: `${RUN}-source` }),
    });
    const sourceSessionId = source.id;

    const live = await spawnCaptureAgent(port, sourceSessionId, ids.live);
    const paused = await spawnCaptureAgent(port, sourceSessionId, ids.paused);
    const detached = await spawnCaptureAgent(port, sourceSessionId, ids.detached);
    await waitForCaptureContains(ctx, ids.live, ["# F-Mark agent onboarding", sourceSessionId, ids.live]);
    await waitForCaptureContains(ctx, ids.paused, ["# F-Mark agent onboarding", sourceSessionId, ids.paused]);
    await waitForCaptureContains(ctx, ids.detached, ["# F-Mark agent onboarding", sourceSessionId, ids.detached]);
    await http(port, `/managed-agents/${encodeURIComponent(ids.paused)}/pause`, { method: "POST" });
    await run("tmux", ["kill-session", "-t", detached.tmux_session], {
      cwd: ctx.project,
      env: ctx.env,
    });
    pass("real tmux managed agent matrix prepared", {
      sourceSessionId,
      live: live.tmux_session,
      paused: paused.tmux_session,
      detached: detached.tmux_session,
    });

    await createSourceEvents(ctx, sourceSessionId, ids.live);
    const sourceDir = join(ctx.project, ".f-mark/sessions", sourceSessionId);
    const sourceBeforeFork = await snapshotTree(sourceDir);
    assert(Object.keys(sourceBeforeFork).some((key) => key.endsWith(".prose.md")), "source snapshot missing prose event");
    assert(Object.keys(sourceBeforeFork).some((key) => key.endsWith(".todo.json")), "source snapshot missing todo event");
    assert(Object.keys(sourceBeforeFork).some((key) => key.endsWith(".flow.json")), "source snapshot missing flow event");
    assert(Object.keys(sourceBeforeFork).some((key) => key.endsWith(".file.json")), "source snapshot missing file event");
    assert(Object.keys(sourceBeforeFork).some((key) => key.endsWith(".html/")), "source snapshot missing html bundle");

    const ws = await openWs(port);
    const fork = await http(port, `/sessions/${encodeURIComponent(sourceSessionId)}/fork`, {
      method: "POST",
      body: JSON.stringify({ name: `${RUN}-fork` }),
    });
    const forkSessionId = fork.session.id;
    assert(fork.source_session_id === sourceSessionId, "fork source id mismatch");
    assert(forkSessionId !== sourceSessionId, "fork reused source session id");
    assert(fork.copied_entries === Object.keys(sourceBeforeFork).length, "copied_entries did not match source tree");
    const byAgent = Object.fromEntries(fork.agents.map((agent) => [agent.participant_id, agent]));
    assert(byAgent[ids.live]?.status === "rebound", "live connected agent did not rebound");
    assert(byAgent[ids.paused]?.status === "skipped-paused", "paused agent was not skipped-paused");
    assert(byAgent[ids.detached]?.status === "skipped-detached", "detached agent was not skipped-detached");

    const forkedMessage = await waitForMessage(
      ws.messages,
      (message) => message.type === "session.forked" && message.session?.id === forkSessionId,
      "session.forked",
    );
    const updatedMessage = await waitForMessage(
      ws.messages,
      (message) =>
        message.type === "managed-agent.updated" &&
        message.agent?.participant_id === ids.live &&
        message.agent?.active_session === forkSessionId,
      "managed-agent.updated",
    );
    pass("websocket announced session.forked and managed-agent.updated", {
      forkSessionId: forkedMessage.session.id,
      updatedAgent: updatedMessage.agent.participant_id,
    });

    const forkDir = join(ctx.project, ".f-mark/sessions", forkSessionId);
    const forkMetadata = JSON.parse(await readFile(join(forkDir, ".fork.json"), "utf8"));
    assert(forkMetadata.schema === "fmark.session-fork.v1", "fork metadata schema mismatch");
    assert(forkMetadata.source_session_id === sourceSessionId, "fork metadata source mismatch");
    assert(forkMetadata.agent_participant_ids.includes(ids.live), "fork metadata missing live agent");
    /* The new fork-link UX writes one sys-fork.fork-link.json event into
       each side at fork time. Treat .fork.json and the new fork-link
       files as canonically-additive; the original byte-for-byte invariant
       is preserved over the rest of the tree. */
    const FORK_LINK_RE = /(^|\/)\d{8}T\d{6}(?:\.\d{3})?Z_sys-fork\.fork-link\.json$/;
    const forkSnapshot = await snapshotTree(forkDir, {
      exclude: (rel) => rel === ".fork.json" || FORK_LINK_RE.test(rel),
    });
    assertSnapshotsEqual(sourceBeforeFork, forkSnapshot, "fork copy");
    const sourceAfterFork = await snapshotTree(sourceDir, {
      exclude: (rel) => FORK_LINK_RE.test(rel),
    });
    assertSnapshotsEqual(sourceBeforeFork, sourceAfterFork, "source after fork");
    const sourceRawEntries = Object.keys(await snapshotTree(sourceDir));
    const forkRawEntries = Object.keys(await snapshotTree(forkDir));
    const sourceForkLinks = sourceRawEntries.filter((k) => FORK_LINK_RE.test(k));
    const forkForkLinks = forkRawEntries.filter((k) => FORK_LINK_RE.test(k));
    assert(sourceForkLinks.length === 1, "source must have exactly one fork-link marker");
    assert(forkForkLinks.length === 1, "fork must have exactly one fork-link marker");
    /* The fork must contain only its OWN fork-link(from=source). The
       source's fork-link(to=fork) must NOT be copied across. The filenames
       differ by content, but both match FORK_LINK_RE — assert payload
       direction below if needed. For now, the count check above plus the
       copy-exclusion logic in sessions.ts guarantees no propagation. */
    pass("fork copied session tree and left source tree untouched (modulo fork-link markers)", {
      sourceSessionId,
      forkSessionId,
      copiedEntries: fork.copied_entries,
      treeEntries: Object.keys(sourceBeforeFork).length,
    });

    await assertAgentSessions(port, sourceSessionId, forkSessionId, ids);
    await waitForCaptureContains(ctx, ids.live, ["F-Mark fork handoff", sourceSessionId, forkSessionId]);
    const pausedCapture = await readFile(join(ctx.captureDir, `${ids.paused}.txt`), "utf8");
    assert(!pausedCapture.includes("F-Mark fork handoff"), "paused agent received fork handoff");
    pass("fork handoff was delivered only to live tmux pane", {
      liveAgent: ids.live,
      forkSessionId,
    });

    const postForkSourceSnapshot = await snapshotTree(sourceDir);
    await runMcpPostAfterHandoff(ctx, port, sourceSessionId, forkSessionId, ids.live);
    const sourceAfterMcpWrite = await snapshotTree(sourceDir);
    assertSnapshotsEqual(postForkSourceSnapshot, sourceAfterMcpWrite, "source after MCP handoff write");

    const allSessions = await http(port, "/sessions?scope=all");
    assert(
      allSessions.sessions.some((session) => session.id === sourceSessionId) &&
        allSessions.sessions.some((session) => session.id === forkSessionId),
      "scope=all did not include source and fork sessions",
    );
    pass("all-session listing includes source and fork with path tags", {
      sessions: allSessions.sessions.map((session) => ({
        id: session.id,
        path: session.path,
        path_id: session.path_id,
      })),
    });

    await runMcpForkToolCase(ctx, port, sourceSessionId, ids.live);
    ws.ws.close();
  } finally {
    if (kernel !== null) await kernel.stop();
    try {
      await run("tmux", ["kill-server"], {
        cwd: ctx.project,
        env: ctx.env,
        timeoutMs: 5_000,
      });
    } catch {
      // The isolated tmux server may already be gone.
    }
    if (kernel !== null) {
      report.kernelLogTail = kernel.logs();
    }
  }
}

async function main() {
  const artifactRoot = await mkdtemp(join(tmpdir(), "fmark-mcp-phase17-hot-"));
  report.artifactRoot = artifactRoot;
  try {
    await phase17Case(artifactRoot);
    await writeFile(join(artifactRoot, "report.json"), JSON.stringify(report, null, 2));
    console.log(`HOT_TEST_REPORT ${join(artifactRoot, "report.json")}`);
    console.log(JSON.stringify({ run: RUN, artifactRoot, passes: report.checks.length }, null, 2));
  } catch (error) {
    report.checks.push({
      name: "Phase 17 session fork hot runner",
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
