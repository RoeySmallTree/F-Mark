#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WORKSPACE = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const DIST_INDEX = join(WORKSPACE, "packages/kernel/dist/index.js");
const RUN = `phase9-${Date.now().toString(36)}`;
const TOKEN = `${RUN}-token`;

if (process.env.FMARK_HOT !== "1") {
  console.error("Set FMARK_HOT=1 to run Phase 9 spawn sequencing hot checks.");
  process.exit(1);
}

const report = {
  run: RUN,
  artifactRoot: null,
  checks: [],
};

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
        timeout: options.timeoutMs ?? 20_000,
        maxBuffer: 1024 * 1024,
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

async function makeContext(artifactRoot, name) {
  const root = join(artifactRoot, name);
  const project = join(root, "project");
  const home = join(root, "home");
  const xdg = join(root, "xdg");
  const codexHome = join(home, ".codex");
  const tmuxTmp = join(root, "tmux");
  await mkdir(project, { recursive: true });
  await mkdir(home, { recursive: true });
  await mkdir(xdg, { recursive: true });
  await mkdir(codexHome, { recursive: true });
  await mkdir(tmuxTmp, { recursive: true, mode: 0o700 });
  await mkdir(join(home, ".gemini"), { recursive: true });
  await writeFile(
    join(home, ".gemini/trustedFolders.json"),
    JSON.stringify({ [project]: "TRUST_FOLDER" }, null, 2),
  );
  return {
    root,
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
  let parsed;
  try {
    parsed = text.length > 0 ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} failed ${res.status}: ${text}`);
  }
  return parsed;
}

async function createSession(port, slug) {
  const created = await api(port, "POST", "/sessions", { slug });
  return created.session?.id ?? created.id;
}

async function upsertRuntime(port, id, entry) {
  await api(port, "PUT", `/runtimes/${encodeURIComponent(id)}`, entry);
}

async function spawnAgent(port, body) {
  return api(port, "POST", "/managed-agents/spawn", body);
}

async function deleteAgent(port, participantId) {
  const token = await api(
    port,
    "GET",
    `/managed-agents/${encodeURIComponent(participantId)}/confirm-token`,
  );
  await api(
    port,
    "DELETE",
    `/managed-agents/${encodeURIComponent(participantId)}?confirm=${encodeURIComponent(token.token)}`,
  );
}

async function waitForFileContains(path, needles, timeoutMs = 12_000) {
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
  while (Date.now() - started < 12_000) {
    const rootPid = await panePid(ctx, sessionName);
    const lines = await processTreeCmdlines(rootPid);
    const hit = lines.find((line) => line.includes(runtimeId));
    if (hit !== undefined) return { rootPid, lines, hit };
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
  }
  throw new Error(`timed out waiting for ${runtimeId} process in ${sessionName}`);
}

async function promptIntegrityCase(artifactRoot) {
  const ctx = await makeContext(artifactRoot, "prompt-integrity");
  const port = 9800 + Math.floor(Math.random() * 300);
  const kernel = await startKernel(ctx.project, port, ctx.env);
  const capturePath = join(ctx.root, "launch-prompt.txt");
  try {
    await upsertRuntime(port, "capture", {
      displayName: "Capture Runtime",
      executable: "/usr/bin/tee",
      args: [capturePath],
      readyDelayMs: 0,
    });
    const sessionId = await createSession(port, `${RUN}-prompt`);
    const participantId = "ag-p9-capture";
    const spawned = await spawnAgent(port, {
      runtime_id: "capture",
      session_id: sessionId,
      suggested_participant_id: participantId,
    });
    assert(spawned.mcp_status === "unsupported", `capture mcp_status was ${spawned.mcp_status}`);
    assert(spawned.runtime_session?.desired_name === sessionId, "capture desired_name missing");
    assert(spawned.runtime_session?.native_name_applied === false, "capture native name should not be applied");
    const prompt = await waitForFileContains(capturePath, [
      "# F-Mark agent onboarding",
      "fmark_post_prose",
      "fmark_end_turn",
      "## Launch Packet",
      participantId,
      sessionId,
    ]);
    assert(!prompt.includes("curl -X POST"), "launch prompt included curl REST instructions");
    assert(!prompt.includes("POST /sessions"), "launch prompt included REST session instructions");
    assert(!prompt.includes(".f-mark/AGENT.md"), "launch prompt referenced static AGENT.md");
    const listed = await api(port, "GET", "/managed-agents");
    const listedAgent = listed.agents.find((agent) => agent.participant_id === participantId);
    assert(listedAgent?.runtime_session?.desired_name === sessionId, "listed runtime_session desired_name mismatch");
    await deleteAgent(port, participantId);
    pass("benign runtime full prompt injection", {
      sessionId,
      participantId,
      promptBytes: prompt.length,
    });
  } finally {
    await kernel.stop();
  }
}

async function vendorLaunchCase(artifactRoot, runtimeId) {
  const ctx = await makeContext(artifactRoot, `${runtimeId}-launch`);
  const port = 9400 + Math.floor(Math.random() * 300);
  const kernel = await startKernel(ctx.project, port, ctx.env);
  try {
    await upsertRuntime(port, runtimeId, {
      displayName:
        runtimeId === "claude" ? "Claude Code" : runtimeId === "codex" ? "Codex" : "Gemini",
      executable: runtimeId,
      args: [],
      readyDelayMs: 60_000,
    });
    const sessionId = await createSession(port, `${RUN}-${runtimeId}`);
    const participantId = `ag-p9-${runtimeId}`;
    const spawned = await spawnAgent(port, {
      runtime_id: runtimeId,
      session_id: sessionId,
      suggested_participant_id: participantId,
    });
    assert(spawned.runtime_session?.desired_name === sessionId, `${runtimeId} desired_name missing`);
    const expectedNative = runtimeId === "claude";
    assert(
      spawned.runtime_session?.native_name_applied === expectedNative,
      `${runtimeId} native_name_applied mismatch`,
    );
    assert(typeof spawned.mcp_status === "string", `${runtimeId} mcp_status missing`);
    const processInfo = await waitForProcessCmdline(ctx, spawned.tmux_session, runtimeId);
    const combined = processInfo.lines.join("\n");
    if (runtimeId === "claude") {
      assert(combined.includes("--name"), "Claude process argv did not include --name");
      assert(combined.includes(sessionId), "Claude process argv did not include F-Mark session id");
    } else if (runtimeId === "codex") {
      assert(!combined.includes(`--name ${sessionId}`), "Codex process argv faked Claude --name");
      assert(combined.includes(sessionId), "Codex process argv did not include native launch prompt session id");
      assert(combined.includes("fmark_post_prose"), "Codex process argv did not include MCP launch guide");
    } else if (runtimeId === "gemini") {
      assert(!combined.includes(`--name ${sessionId}`), "Gemini process argv faked Claude --name");
      assert(combined.includes("--prompt-interactive"), "Gemini process argv did not use --prompt-interactive");
      assert(combined.includes("--skip-trust"), "Gemini process argv did not include --skip-trust");
      assert(combined.includes(sessionId), "Gemini process argv did not include native launch prompt session id");
    } else {
      assert(!combined.includes(`--name ${sessionId}`), `${runtimeId} process argv faked Claude --name`);
      assert(!combined.includes(sessionId), `${runtimeId} process argv included desired session id`);
    }
    await deleteAgent(port, participantId);
    pass(`${runtimeId} real vendor launch argv`, {
      sessionId,
      participantId,
      nativeNameApplied: expectedNative,
      process: processInfo.hit,
    });
  } finally {
    await kernel.stop();
  }
}

async function main() {
  let artifactRoot = null;
  try {
    artifactRoot = await mkdtemp(join(tmpdir(), "fmark-mcp-phase9-hot-"));
    report.artifactRoot = artifactRoot;
    await promptIntegrityCase(artifactRoot);
    for (const runtimeId of ["claude", "codex", "gemini"]) {
      await vendorLaunchCase(artifactRoot, runtimeId);
    }
    await writeFile(join(artifactRoot, "report.json"), JSON.stringify(report, null, 2));
    console.log(`HOT_TEST_REPORT ${join(artifactRoot, "report.json")}`);
    console.log(JSON.stringify({ run: RUN, artifactRoot, passes: report.checks.length }, null, 2));
  } catch (error) {
    if (artifactRoot === null) artifactRoot = await mkdtemp(join(tmpdir(), "fmark-mcp-phase9-hot-"));
    report.checks.push({
      name: "Phase 9 spawn sequencing hot runner",
      status: "FAIL",
      error: error instanceof Error ? error.message : String(error),
    });
    await writeFile(join(artifactRoot, "report.failed.json"), JSON.stringify(report, null, 2));
    console.error(`HOT_TEST_FAILED_REPORT ${join(artifactRoot, "report.failed.json")}`);
    throw error;
  } finally {
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
