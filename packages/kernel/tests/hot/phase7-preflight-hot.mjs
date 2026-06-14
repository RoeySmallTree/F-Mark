#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WORKSPACE = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const DIST_INDEX = join(WORKSPACE, "packages/kernel/dist/index.js");
const RUN = `phase7-${Date.now().toString(36)}`;
const TOKEN = `${RUN}-token`;
const VERSION = "phase5-stdio-v1";

if (process.env.FMARK_HOT !== "1") {
  console.error("Set FMARK_HOT=1 to run Phase 7 preflight hot checks.");
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

async function preflight(port, runtimeId) {
  const res = await fetch(`http://127.0.0.1:${port}/managed-agents/preflight`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({
      runtime_id: runtimeId,
      participant_id: "ag-p7pre",
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`preflight ${runtimeId} failed ${res.status}: ${text}`);
  return JSON.parse(text);
}

function assertMcpStatus(result, runtime, status) {
  if (status !== "blocked") {
    assert(result.runtime.available === true, `${runtime} runtime unavailable: ${result.runtime.reason}`);
  }
  assert(result.mcp.status === status, `${runtime} expected ${status}, got ${result.mcp.status}`);
}

function currentServer(project) {
  return {
    command: process.execPath,
    args: [DIST_INDEX, "mcp", "--path", project],
    env: { F_MARK_MCP_VERSION: VERSION },
  };
}

async function writeCurrent(project, home, codexHome, runtime) {
  if (runtime === "claude") {
    await writeFile(
      join(project, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          fmark: {
            type: "stdio",
            ...currentServer(project),
          },
        },
      }, null, 2),
    );
    await writeFile(
      join(home, ".claude.json"),
      JSON.stringify({
        projects: {
          [project]: {
            enabledMcpjsonServers: ["fmark"],
            disabledMcpjsonServers: [],
          },
        },
      }, null, 2),
    );
  } else if (runtime === "codex") {
    await mkdir(codexHome, { recursive: true });
    const server = currentServer(project);
    await writeFile(
      join(codexHome, "config.toml"),
      [
        "[mcp_servers.fmark]",
        `command = ${JSON.stringify(server.command)}`,
        `args = ${JSON.stringify(server.args)}`,
        "",
        "[mcp_servers.fmark.env]",
        `F_MARK_MCP_VERSION = "${VERSION}"`,
        "",
      ].join("\n"),
    );
  } else if (runtime === "gemini") {
    await mkdir(join(project, ".gemini"), { recursive: true });
    await writeFile(
      join(project, ".gemini/settings.json"),
      JSON.stringify({
        mcpServers: {
          fmark: {
            ...currentServer(project),
            trust: false,
          },
        },
      }, null, 2),
    );
  }
}

async function writeStale(project, codexHome, runtime) {
  if (runtime === "claude") {
    const path = join(project, ".mcp.json");
    const parsed = JSON.parse(await readFile(path, "utf8"));
    parsed.mcpServers.fmark.env.F_MARK_MCP_VERSION = "old-version";
    await writeFile(path, JSON.stringify(parsed, null, 2));
  } else if (runtime === "codex") {
    await writeFile(
      join(codexHome, "config.toml"),
      [
        "[mcp_servers.fmark]",
        'command = "node"',
        "",
        "[mcp_servers.fmark.env]",
        'F_MARK_MCP_VERSION = "old-version"',
        "",
      ].join("\n"),
    );
  } else if (runtime === "gemini") {
    const path = join(project, ".gemini/settings.json");
    const parsed = JSON.parse(await readFile(path, "utf8"));
    parsed.mcpServers.fmark.env.F_MARK_MCP_VERSION = "old-version";
    await writeFile(path, JSON.stringify(parsed, null, 2));
  }
}

async function writeBlocked(project, codexHome, runtime) {
  if (runtime === "claude") {
    await writeFile(join(project, ".mcp.json"), "{ nope");
    return join(project, ".mcp.json");
  }
  if (runtime === "codex") {
    const path = join(codexHome, "config.toml");
    await writeFile(path, "[mcp_servers.fmark\ncommand = \"node\"\n");
    return path;
  }
  const path = join(project, ".gemini/settings.json");
  await writeFile(path, "{ nope");
  return path;
}

async function main() {
  let kernel = null;
  const artifactRoot = await mkdtemp(join(tmpdir(), "fmark-mcp-phase7-hot-"));
  const project = join(artifactRoot, "project");
  const home = join(artifactRoot, "home");
  const xdg = join(artifactRoot, "xdg");
  const codexHome = join(home, ".codex");
  await mkdir(project, { recursive: true });
  await mkdir(home, { recursive: true });
  await mkdir(xdg, { recursive: true });
  await mkdir(codexHome, { recursive: true });
  report.artifactRoot = artifactRoot;
  const port = 8900 + Math.floor(Math.random() * 900);
  const env = {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: xdg,
    CODEX_HOME: codexHome,
    NO_COLOR: "1",
  };

  try {
    kernel = await startKernel(project, port, env);

    for (const runtime of ["claude", "codex", "gemini"]) {
      assertMcpStatus(await preflight(port, runtime), runtime, "missing");
      pass(`${runtime} missing`);

      await writeCurrent(project, home, codexHome, runtime);
      assertMcpStatus(await preflight(port, runtime), runtime, "installed");
      pass(`${runtime} installed`);

      await writeStale(project, codexHome, runtime);
      assertMcpStatus(await preflight(port, runtime), runtime, "stale");
      pass(`${runtime} stale`);

      const blockedPath = await writeBlocked(project, codexHome, runtime);
      const before = await readFile(blockedPath, "utf8");
      assertMcpStatus(await preflight(port, runtime), runtime, "blocked");
      const after = await readFile(blockedPath, "utf8");
      assert(before === after, `${runtime} blocked config was modified`);
      pass(`${runtime} blocked unchanged`);
    }

    await writeFile(join(artifactRoot, "report.json"), JSON.stringify(report, null, 2));
    console.log(`HOT_TEST_REPORT ${join(artifactRoot, "report.json")}`);
    console.log(JSON.stringify({ run: RUN, artifactRoot, passes: report.checks.length }, null, 2));
  } catch (error) {
    report.checks.push({
      name: "Phase 7 preflight hot runner",
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
