#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const WORKSPACE = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const DIST_INDEX = join(WORKSPACE, "packages/kernel/dist/index.js");
const RUN = `phase6-${Date.now().toString(36)}`;
const TOKEN = `${RUN}-token`;

if (process.env.FMARK_HOT !== "1") {
  console.error("Set FMARK_HOT=1 to run Phase 6 guide hot checks.");
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
  if (!res.ok) throw new Error(`${path} failed ${res.status}: ${text}`);
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return JSON.parse(text);
  return text;
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

function assertMcpGuide(text, runtime) {
  for (const token of ["fmark_post_prose", "fmark_end_turn", "fmark_read_events", "fmark://guide"]) {
    assert(text.includes(token), `${runtime} guide missing ${token}`);
  }
  for (const forbidden of ["curl", "POST /sessions", "GET /sessions", "Authorization: Bearer", "Base URL"]) {
    assert(!text.includes(forbidden), `${runtime} guide still contains REST wording: ${forbidden}`);
  }
  assert(
    text.includes("Immediately call `fmark_post_prose`"),
    `${runtime} guide does not tell first action`,
  );
}

async function readMcpGuideResource(project, env) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [DIST_INDEX, "mcp", "--path", project],
    cwd: project,
    env,
    stderr: "pipe",
  });
  const client = new Client({ name: "phase6-guide-hot", version: "0.0.1" }, { capabilities: {} });
  try {
    await client.connect(transport);
    const result = await client.readResource({ uri: "fmark://guide" });
    return (result.contents ?? []).map((entry) => entry.text ?? "").join("\n");
  } finally {
    await client.close().catch(() => {});
  }
}

async function main() {
  let kernel = null;
  const artifactRoot = await mkdtemp(join(tmpdir(), "fmark-mcp-phase6-hot-"));
  const project = join(artifactRoot, "project");
  const home = join(artifactRoot, "home");
  const xdg = join(artifactRoot, "xdg");
  await mkdir(project, { recursive: true });
  await mkdir(home, { recursive: true });
  await mkdir(xdg, { recursive: true });
  report.artifactRoot = artifactRoot;
  const port = 8700 + Math.floor(Math.random() * 1000);
  const env = {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: xdg,
    NO_COLOR: "1",
  };

  try {
    kernel = await startKernel(project, port, env);
    const session = await http(port, "/sessions", {
      method: "POST",
      body: JSON.stringify({ slug: `${RUN}-guide` }),
    });
    const participant = await http(port, "/participants/register", {
      method: "POST",
      body: JSON.stringify({
        kind: "agent",
        name: "Phase 6 Guide Agent",
        suggested_id: "ag-p6guide",
      }),
    });
    await http(port, `/agents/${participant.id}/link`, {
      method: "POST",
      body: JSON.stringify({ session_id: session.id }),
    });

    for (const runtime of ["claude", "codex", "gemini"]) {
      const guide = await http(
        port,
        `/guide?runtime_id=${runtime}&session_id=${encodeURIComponent(session.id)}&agent_id=${participant.id}`,
      );
      assertMcpGuide(guide, runtime);
      pass(`MCP guide ${runtime}`, { sessionId: session.id, participantId: participant.id });
    }

    const rest = await http(
      port,
      `/guide-rest-variant?runtime_id=claude&session_id=${encodeURIComponent(session.id)}&agent_id=${participant.id}`,
    );
    for (const token of ["curl", "POST /sessions", "Authorization: Bearer", "GET /sessions"]) {
      assert(rest.includes(token), `REST guide missing ${token}`);
    }
    pass("REST guide variant keeps HTTP reference");

    const resourceGuide = await readMcpGuideResource(project, {
      ...env,
      F_MARK_PATH: project,
      F_MARK_AGENT_ID: participant.id,
      F_MARK_SESSION_ID: session.id,
      F_MARK_RUNTIME_ID: "claude",
    });
    assertMcpGuide(resourceGuide, "mcp-resource");
    assert(resourceGuide.includes(session.id), "MCP guide resource missing session id");
    assert(resourceGuide.includes(participant.id), "MCP guide resource missing participant id");
    pass("MCP guide resource");

    await writeFile(join(artifactRoot, "report.json"), JSON.stringify(report, null, 2));
    console.log(`HOT_TEST_REPORT ${join(artifactRoot, "report.json")}`);
    console.log(JSON.stringify({
      run: RUN,
      artifactRoot,
      passes: report.checks.length,
    }, null, 2));
  } catch (error) {
    report.checks.push({
      name: "Phase 6 guide hot runner",
      status: "FAIL",
      error: error instanceof Error ? error.message : String(error),
    });
    await writeFile(join(artifactRoot, "report.failed.json"), JSON.stringify(report, null, 2));
    console.error(`HOT_TEST_FAILED_REPORT ${join(artifactRoot, "report.failed.json")}`);
    throw error;
  } finally {
    if (kernel !== null) await kernel.stop();
    if (process.env.FMARK_HOT_KEEP !== "1") {
      const reportPath = existsSync(join(artifactRoot, "report.json"))
        ? join(artifactRoot, "report.json")
        : join(artifactRoot, "report.failed.json");
      const saved = existsSync(reportPath) ? await readFile(reportPath, "utf8") : null;
      await rm(project, { recursive: true, force: true });
      await rm(home, { recursive: true, force: true });
      await rm(xdg, { recursive: true, force: true });
      if (saved !== null) await writeFile(reportPath, saved);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
