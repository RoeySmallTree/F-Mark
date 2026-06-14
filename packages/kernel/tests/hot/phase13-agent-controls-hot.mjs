#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import {
  chmod,
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

const WORKSPACE = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const DIST_INDEX = join(WORKSPACE, "packages/kernel/dist/index.js");
const RUN = `phase13-${Date.now().toString(36)}`;
const TOKEN = `${RUN}-token`;
const LAUNCH_MARKER = "<!-- fmark:launch-prompt:v1 -->";

if (process.env.FMARK_HOT !== "1") {
  console.error("Set FMARK_HOT=1 to run Phase 13 agent-control hot checks.");
  process.exit(1);
}

const report = { run: RUN, artifactRoot: null, checks: [] };

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
    const error = new Error(`${init.method ?? "GET"} ${path} failed ${res.status}: ${text}`);
    error.status = res.status;
    error.body = parsed;
    throw error;
  }
  return parsed;
}

async function expectHttpError(port, path, init, status, includes) {
  try {
    await http(port, path, init);
  } catch (err) {
    assert(err.status === status, `${path} expected ${status}, got ${err.status}`);
    assert(JSON.stringify(err.body).includes(includes), `${path} error did not include ${includes}`);
    return err.body;
  }
  throw new Error(`${path} unexpectedly succeeded`);
}

async function makeContext(artifactRoot, name) {
  const root = join(artifactRoot, name);
  const project = join(root, "project");
  const home = join(root, "home");
  const xdg = join(root, "xdg");
  const codexHome = join(home, ".codex");
  const tmuxTmp = join(root, "tmux");
  const captureDir = join(root, "captures");
  await mkdir(project, { recursive: true });
  await mkdir(home, { recursive: true });
  await mkdir(xdg, { recursive: true });
  await mkdir(codexHome, { recursive: true });
  await mkdir(tmuxTmp, { recursive: true, mode: 0o700 });
  await mkdir(captureDir, { recursive: true });
  await mkdir(join(home, ".gemini"), { recursive: true });
  await writeFile(
    join(home, ".gemini/trustedFolders.json"),
    JSON.stringify({ [project]: "TRUST_FOLDER" }, null, 2),
  );
  const captureRuntime = join(root, "capture-runtime");
  await writeFile(
    captureRuntime,
    [
      "#!/bin/sh",
      'mkdir -p "$FMARK_CAPTURE_DIR"',
      'OUT="$FMARK_CAPTURE_DIR/${F_MARK_AGENT_ID:-unknown}.txt"',
      'printf "%s\\n" "$*" >> "$OUT"',
      'cat >> "$OUT"',
      "",
    ].join("\n"),
  );
  await chmod(captureRuntime, 0o755);
  return {
    root,
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

async function createSession(port, slug) {
  const session = await http(port, "/sessions", {
    method: "POST",
    body: JSON.stringify({ slug }),
  });
  return session.id;
}

async function defaultUserId(port) {
  const roster = await http(port, "/participants");
  const found = Object.entries(roster.participants ?? {}).find(([, p]) => p.kind === "user");
  assert(found !== undefined, "default user participant not found");
  return found[0];
}

async function upsertRuntime(port, id, entry) {
  await http(port, `/runtimes/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(entry),
  });
}

async function spawnAgent(port, runtimeId, sessionId, participantId) {
  return http(port, "/managed-agents/spawn", {
    method: "POST",
    body: JSON.stringify({
      runtime_id: runtimeId,
      session_id: sessionId,
      suggested_participant_id: participantId,
    }),
  });
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

async function waitForCaptureContains(ctx, participantId, needles, timeoutMs = 15_000) {
  const path = join(ctx.captureDir, `${participantId}.txt`);
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const text = await readFile(path, "utf8");
      if (needles.every((needle) => text.includes(needle))) return text;
    } catch {
      // keep polling
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`timed out waiting for ${path} to contain ${needles.join(", ")}`);
}

async function statusAgent(port, participantId) {
  const status = await http(port, "/managed-agents/status");
  const agent = status.agents.find((entry) => entry.participant_id === participantId);
  assert(agent !== undefined, `status missing ${participantId}`);
  return agent;
}

async function postUserProse(port, sessionId, participantId, content) {
  await http(port, `/sessions/${encodeURIComponent(sessionId)}/events/prose`, {
    method: "POST",
    body: JSON.stringify({ participant_id: participantId, content }),
  });
}

async function captureRouteMatrixCase(artifactRoot) {
  const ctx = await makeContext(artifactRoot, "capture-matrix");
  const port = 10_100 + Math.floor(Math.random() * 500);
  let kernel = null;
  const ids = {
    claude: "ag-p13-claude",
    codex: "ag-p13-codex",
    gemini: "ag-p13-gemini",
  };
  try {
    kernel = await startKernel(ctx.project, port, ctx.env);
    const sessionId = await createSession(port, `${RUN}-controls`);
    const userId = await defaultUserId(port);
    for (const runtimeId of ["claude", "codex", "gemini"]) {
      await upsertRuntime(port, runtimeId, {
        displayName: runtimeId,
        executable: ctx.captureRuntime,
        args: [],
        env: { FMARK_CAPTURE_DIR: ctx.captureDir },
        readyDelayMs: 0,
      });
      await spawnAgent(port, runtimeId, sessionId, ids[runtimeId]);
      await waitForCaptureContains(ctx, ids[runtimeId], [
        LAUNCH_MARKER,
        "# F-Mark agent onboarding",
        sessionId,
      ]);
    }

    let claude = await statusAgent(port, ids.claude);
    assert(claude.connection_state === "connected", "claude capture was not connected");
    assert(claude.paused === false, "claude capture unexpectedly paused");

    await http(port, `/managed-agents/${ids.claude}/pause`, { method: "POST" });
    claude = await statusAgent(port, ids.claude);
    assert(claude.paused === true, "pause did not persist");
    await postUserProse(port, sessionId, userId, `FMARK_${RUN}_PAUSED_WAKE`);
    const pausedWake = await http(port, `/sessions/${encodeURIComponent(sessionId)}/wake`, {
      method: "POST",
      body: JSON.stringify({ target_participant_ids: [ids.claude], reason: "manual" }),
    });
    assert(pausedWake.notified.length === 0, "paused agent was woken");
    assert(pausedWake.skipped.some((entry) => entry.reason === "paused"), "paused wake skip missing");
    await http(port, `/managed-agents/${ids.claude}/resume`, { method: "POST" });
    claude = await statusAgent(port, ids.claude);
    assert(claude.paused === false, "resume did not persist");

    const renamed = await http(port, `/managed-agents/${ids.claude}`, {
      method: "PATCH",
      body: JSON.stringify({ display_name: "Ada Phase 13" }),
    });
    assert(renamed.agent.display_name === "Ada Phase 13", "rename did not update status row");
    const context = await http(port, `/managed-agents/${ids.claude}/context`);
    assert(context.status === "unknown", "context should be unknown without verified source");
    const access = await http(port, `/managed-agents/${ids.claude}/access`);
    assert(access.change_supported === false, "access should be read-only/unsupported");
    await expectHttpError(
      port,
      `/managed-agents/${ids.claude}/access`,
      { method: "PATCH", body: JSON.stringify({ mode: "anything" }) },
      409,
      "not verified",
    );

    await postUserProse(port, sessionId, userId, `FMARK_${RUN}_NOTIFIED`);
    await http(port, `/sessions/${encodeURIComponent(sessionId)}/wake`, {
      method: "POST",
      body: JSON.stringify({ target_participant_ids: [ids.codex], reason: "manual" }),
    });
    const codexNotified = await statusAgent(port, ids.codex);
    assert(codexNotified.activity_state === "notified", "wake did not mark codex notified");
    await expectHttpError(
      port,
      `/managed-agents/${ids.codex}/compact`,
      { method: "POST" },
      409,
      "notified",
    );
    await http(
      port,
      `/sessions/${encodeURIComponent(sessionId)}/inbox?participant_id=${ids.codex}`,
    );
    const codexIdle = await statusAgent(port, ids.codex);
    assert(codexIdle.activity_state === "idle", "inbox read did not clear notified state");

    await http(port, `/managed-agents/${ids.claude}/compact`, { method: "POST" });
    await http(port, `/managed-agents/${ids.claude}/clear`, { method: "POST" });
    await waitForCaptureContains(ctx, ids.claude, ["/compact", "/clear"]);
    await http(port, `/managed-agents/${ids.codex}/compact`, { method: "POST" });
    await http(port, `/managed-agents/${ids.codex}/clear`, { method: "POST" });
    await waitForCaptureContains(ctx, ids.codex, ["/compact", "/clear"]);
    await http(port, `/managed-agents/${ids.gemini}/compact`, { method: "POST" });
    await http(port, `/managed-agents/${ids.gemini}/clear`, { method: "POST" });
    await waitForCaptureContains(ctx, ids.gemini, ["/compress", "/clear"]);

    await run("tmux", ["kill-session", "-t", (await statusAgent(port, ids.gemini)).tmux_session], {
      cwd: ctx.project,
      env: ctx.env,
    });
    const detached = await statusAgent(port, ids.gemini);
    assert(detached.connection_state === "detached", "killed gemini pane was not detached");
    const reconnected = await http(port, `/managed-agents/${ids.gemini}/reconnect`, { method: "POST" });
    assert(reconnected.agent.connection_state === "connected", "reconnect did not return connected state");
    await waitForCaptureContains(ctx, ids.gemini, ["# F-Mark wake packet"]);

    for (const id of Object.values(ids)) await deleteAgent(port, id);
    pass("capture runtime control-route matrix", {
      sessionId,
      agents: Object.values(ids),
    });
  } finally {
    if (kernel !== null) await kernel.stop();
    try {
      await run("tmux", ["kill-server"], { cwd: ctx.project, env: ctx.env, timeoutMs: 5_000 });
    } catch {
      // isolated tmux server may already be gone
    }
  }
}

async function panePid(ctx, sessionName) {
  const out = await run(
    "tmux",
    ["display-message", "-t", sessionName, "-p", "#{pane_pid}"],
    { cwd: ctx.project, env: ctx.env },
  );
  const pid = Number(out.stdout.trim());
  assert(Number.isInteger(pid) && pid > 0, `invalid pane pid for ${sessionName}: ${out.stdout}`);
  return pid;
}

async function readCmdline(pid) {
  try {
    const raw = await readFile(`/proc/${pid}/cmdline`);
    return raw.toString("utf8").split("\0").filter(Boolean).join(" ");
  } catch {
    return "";
  }
}

async function childPids(pid) {
  try {
    const children = await readFile(`/proc/${pid}/task/${pid}/children`, "utf8");
    return children.trim().split(/\s+/).filter(Boolean).map(Number);
  } catch {
    try {
      const out = await run("pgrep", ["-P", String(pid)]);
      return out.stdout.trim().split(/\s+/).filter(Boolean).map(Number);
    } catch {
      return [];
    }
  }
}

async function processTreeCmdlines(rootPid, depth = 0) {
  if (depth > 4) return [];
  const current = await readCmdline(rootPid);
  const lines = current ? [current] : [];
  for (const child of await childPids(rootPid)) {
    lines.push(...await processTreeCmdlines(child, depth + 1));
  }
  return lines;
}

async function waitForProcessCmdline(ctx, sessionName, runtimeId) {
  const started = Date.now();
  while (Date.now() - started < 15_000) {
    const rootPid = await panePid(ctx, sessionName);
    const lines = await processTreeCmdlines(rootPid);
    const hit = lines.find((line) => line.includes(runtimeId));
    if (hit !== undefined) return { rootPid, lines, hit };
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
  }
  throw new Error(`timed out waiting for ${runtimeId} process in ${sessionName}`);
}

async function realVendorControlCase(artifactRoot, runtimeId) {
  const ctx = await makeContext(artifactRoot, `${runtimeId}-real-controls`);
  const port = 10_700 + Math.floor(Math.random() * 500);
  let kernel = null;
  try {
    kernel = await startKernel(ctx.project, port, ctx.env);
    await upsertRuntime(port, runtimeId, {
      displayName: runtimeId,
      executable: runtimeId,
      args: [],
      readyDelayMs: 60_000,
    });
    const sessionId = await createSession(port, `${RUN}-${runtimeId}`);
    const participantId = `ag-p13-${runtimeId}`;
    const spawned = await spawnAgent(port, runtimeId, sessionId, participantId);
    const processInfo = await waitForProcessCmdline(ctx, spawned.tmux_session, runtimeId);
    const before = await statusAgent(port, participantId);
    assert(before.connection_state === "connected", `${runtimeId} was not connected before controls`);
    await http(port, `/managed-agents/${participantId}/compact`, { method: "POST" });
    await http(port, `/managed-agents/${participantId}/clear`, { method: "POST" });
    const after = await statusAgent(port, participantId);
    assert(after.connection_state === "connected", `${runtimeId} disconnected after controls`);
    await deleteAgent(port, participantId);
    pass(`${runtimeId} real vendor compact/clear control`, {
      sessionId,
      participantId,
      tmuxSession: spawned.tmux_session,
      process: processInfo.hit,
      compactCommand: runtimeId === "gemini" ? "/compress" : "/compact",
      clearCommand: "/clear",
    });
  } finally {
    if (kernel !== null) await kernel.stop();
    try {
      await run("tmux", ["kill-server"], { cwd: ctx.project, env: ctx.env, timeoutMs: 5_000 });
    } catch {
      // isolated tmux server may already be gone
    }
  }
}

async function main() {
  const artifactRoot = await mkdtemp(join(tmpdir(), "fmark-mcp-phase13-hot-"));
  report.artifactRoot = artifactRoot;
  try {
    await captureRouteMatrixCase(artifactRoot);
    for (const runtimeId of ["claude", "codex", "gemini"]) {
      await realVendorControlCase(artifactRoot, runtimeId);
    }
    await writeFile(join(artifactRoot, "report.json"), JSON.stringify(report, null, 2));
    console.log(`HOT_TEST_REPORT ${join(artifactRoot, "report.json")}`);
    console.log(JSON.stringify({ run: RUN, artifactRoot, passes: report.checks.length }, null, 2));
  } catch (error) {
    report.checks.push({
      name: "Phase 13 agent-control hot runner",
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
