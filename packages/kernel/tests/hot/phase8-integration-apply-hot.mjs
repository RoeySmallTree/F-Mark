#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WORKSPACE = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const DIST_INDEX = join(WORKSPACE, "packages/kernel/dist/index.js");
const RUN = `phase8-${Date.now().toString(36)}`;
const TOKEN = `${RUN}-token`;
const VERSION = "phase5-stdio-v1";

if (process.env.FMARK_HOT !== "1") {
  console.error("Set FMARK_HOT=1 to run Phase 8 integration apply hot checks.");
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

async function readMaybe(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

function run(command, args, options) {
  return new Promise((resolvePromise, reject) => {
    const child = execFile(
      command,
      args,
      {
        cwd: options.cwd,
        env: options.env,
        timeout: options.timeoutMs ?? 35_000,
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

async function makeCaseRoot(artifactRoot, name) {
  const root = join(artifactRoot, name);
  const project = join(root, "project");
  const home = join(root, "home");
  const xdg = join(root, "xdg");
  const codexHome = join(home, ".codex");
  await mkdir(project, { recursive: true });
  await mkdir(home, { recursive: true });
  await mkdir(xdg, { recursive: true });
  await mkdir(codexHome, { recursive: true });
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
    env: {
      ...process.env,
      HOME: home,
      XDG_CONFIG_HOME: xdg,
      CODEX_HOME: codexHome,
      NO_COLOR: "1",
    },
  };
}

async function withKernel(ctx, fn) {
  const port = 9000 + Math.floor(Math.random() * 700);
  const kernel = await startKernel(ctx.project, port, ctx.env);
  try {
    return await fn(port);
  } finally {
    await kernel.stop();
  }
}

async function apply(port, runtimeId, scope) {
  const res = await fetch(`http://127.0.0.1:${port}/managed-agents/integration-apply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({
      runtime_id: runtimeId,
      scope,
      participant_id: `ag-p8-${runtimeId}`,
    }),
  });
  const text = await res.text();
  let body;
  try {
    body = text.length > 0 ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  return { ok: res.ok, status: res.status, body };
}

function assertApplyInstalled(result, runtime, scope) {
  assert(result.ok, `${runtime}/${scope} apply failed ${result.status}: ${JSON.stringify(result.body)}`);
  assert(result.body.mcp?.status === "installed", `${runtime}/${scope} MCP status was ${result.body.mcp?.status}`);
  assert(result.body.applied?.mcp?.scope === scope, `${runtime}/${scope} response applied wrong scope`);
}

function countOccurrences(text, needle) {
  let count = 0;
  let index = text.indexOf(needle);
  while (index >= 0) {
    count++;
    index = text.indexOf(needle, index + needle.length);
  }
  return count;
}

async function assertNoToken(paths) {
  for (const path of paths) {
    const text = await readMaybe(path);
    if (text !== null) {
      assert(!text.includes(TOKEN), `${path} leaked bearer token`);
    }
  }
}

async function assertClaudeList(ctx) {
  const list = await run("claude", ["mcp", "list"], { cwd: ctx.project, env: ctx.env });
  const combined = `${list.stdout}\n${list.stderr}`;
  assert(combined.includes("fmark"), "Claude MCP list did not include fmark");
  assert(combined.includes("Connected"), "Claude MCP list did not report fmark Connected");
  return list;
}

async function assertCodexList(ctx) {
  const list = await run("codex", ["mcp", "list", "--json"], { cwd: ctx.project, env: ctx.env });
  const parsed = JSON.parse(list.stdout);
  const fmark = parsed.find((entry) => entry.name === "fmark");
  assert(fmark, "Codex MCP list did not include fmark");
  assert(fmark.enabled === true, "Codex MCP list did not mark fmark enabled");
  assert(fmark.transport?.env?.F_MARK_MCP_VERSION === VERSION, "Codex MCP env marker missing");
  return list;
}

async function assertGeminiList(ctx) {
  const list = await run("gemini", ["mcp", "list"], { cwd: ctx.project, env: ctx.env });
  const combined = `${list.stdout}\n${list.stderr}`;
  assert(combined.includes("fmark"), "Gemini MCP list did not include fmark");
  assert(combined.includes("Connected"), "Gemini MCP list did not report fmark Connected");
  return list;
}

async function supportedScopeCase(artifactRoot, runtime, scope) {
  const ctx = await makeCaseRoot(artifactRoot, `${runtime}-${scope}-missing`);
  await withKernel(ctx, async (port) => {
    const first = await apply(port, runtime, scope);
    assertApplyInstalled(first, runtime, scope);
    const second = await apply(port, runtime, scope);
    assertApplyInstalled(second, runtime, scope);

    if (runtime === "claude") await assertClaudeList(ctx);
    if (runtime === "codex") await assertCodexList(ctx);
    if (runtime === "gemini") await assertGeminiList(ctx);

    const configPaths = vendorConfigPaths(ctx, runtime, scope);
    await assertNoToken(configPaths);
    for (const path of configPaths) {
      const text = await readMaybe(path);
      if (text !== null) {
        assert(countOccurrences(text, '"fmark"') <= 1, `${path} duplicated JSON fmark key`);
        assert(countOccurrences(text, "[mcp_servers.fmark]") <= 1, `${path} duplicated TOML fmark section`);
        assert(text.includes(VERSION), `${path} missing version marker`);
      }
    }

    if (runtime === "gemini") {
      const config = await readMaybe(configPaths[0]);
      assert(config?.includes('"trust": false'), "Gemini config did not keep trust false");
    }
    pass(`${runtime} ${scope} apply/list/reapply`, {
      configPaths,
      changedFirst: first.body.changed,
      changedSecond: second.body.changed,
    });
  });
}

function vendorConfigPaths(ctx, runtime, scope) {
  if (runtime === "claude" && scope === "project") return [join(ctx.project, ".mcp.json")];
  if (runtime === "claude") return [join(ctx.home, ".claude.json")];
  if (runtime === "codex") return [join(ctx.codexHome, "config.toml")];
  if (runtime === "gemini" && scope === "project") return [join(ctx.project, ".gemini/settings.json")];
  if (runtime === "gemini") return [join(ctx.home, ".gemini/settings.json")];
  return [];
}

async function seedStale(ctx, runtime, scope) {
  if (runtime === "claude" && scope === "project") {
    await writeFile(
      join(ctx.project, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          fmark: {
            type: "stdio",
            command: "node",
            args: ["old.js"],
            env: { F_MARK_MCP_VERSION: "old-version" },
          },
        },
      }, null, 2),
    );
    return;
  }
  if (runtime === "claude" && scope === "local") {
    await writeFile(
      join(ctx.home, ".claude.json"),
      JSON.stringify({
        projects: {
          [ctx.project]: {
            mcpServers: {
              fmark: {
                type: "stdio",
                command: "node",
                args: ["old.js"],
                env: { F_MARK_MCP_VERSION: "old-version" },
              },
            },
          },
        },
      }, null, 2),
    );
    return;
  }
  if (runtime === "codex") {
    await writeFile(
      join(ctx.codexHome, "config.toml"),
      [
        "[mcp_servers.fmark]",
        'command = "node"',
        'args = ["old.js"]',
        "",
        "[mcp_servers.fmark.env]",
        'F_MARK_MCP_VERSION = "old-version"',
        "",
      ].join("\n"),
    );
    return;
  }
  if (runtime === "gemini") {
    const path = scope === "project"
      ? join(ctx.project, ".gemini/settings.json")
      : join(ctx.home, ".gemini/settings.json");
    await mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
    await writeFile(
      path,
      JSON.stringify({
        mcpServers: {
          fmark: {
            command: "node",
            args: ["old.js"],
            env: { F_MARK_MCP_VERSION: "old-version" },
            trust: true,
          },
        },
      }, null, 2),
    );
  }
}

async function staleUpdateCase(artifactRoot, runtime, scope) {
  const ctx = await makeCaseRoot(artifactRoot, `${runtime}-${scope}-stale`);
  await seedStale(ctx, runtime, scope);
  const configPaths = vendorConfigPaths(ctx, runtime, scope);
  await withKernel(ctx, async (port) => {
    const result = await apply(port, runtime, scope);
    assertApplyInstalled(result, runtime, scope);
    if (runtime === "claude") await assertClaudeList(ctx);
    if (runtime === "codex") await assertCodexList(ctx);
    if (runtime === "gemini") await assertGeminiList(ctx);
    for (const path of configPaths) {
      const text = await readMaybe(path);
      assert(text?.includes(VERSION), `${path} was not updated to current version`);
      assert(!text.includes("old-version"), `${path} still contained old version`);
    }
    if (runtime === "gemini") {
      const text = await readMaybe(configPaths[0]);
      assert(text?.includes('"trust": false'), "Gemini stale update did not reset trust false");
    }
    pass(`${runtime} ${scope} stale update`, { configPaths });
  });
}

async function blockedCase(artifactRoot, runtime, scope) {
  const ctx = await makeCaseRoot(artifactRoot, `${runtime}-${scope}-blocked`);
  const path = vendorConfigPaths(ctx, runtime, scope)[0];
  await mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  const invalid =
    runtime === "codex"
      ? "[mcp_servers.fmark\ncommand = \"node\"\n"
      : "{ nope";
  await writeFile(path, invalid);
  await withKernel(ctx, async (port) => {
    const result = await apply(port, runtime, scope);
    assert(!result.ok, `${runtime}/${scope} invalid config apply unexpectedly succeeded`);
    const after = await readFile(path, "utf8");
    assert(after === invalid, `${runtime}/${scope} invalid config was overwritten`);
    pass(`${runtime} ${scope} blocked unchanged`, { path, httpStatus: result.status });
  });
}

async function codexProjectUnsupportedCase(artifactRoot) {
  const ctx = await makeCaseRoot(artifactRoot, "codex-project-unsupported");
  await withKernel(ctx, async (port) => {
    const result = await apply(port, "codex", "project");
    assert(!result.ok, "Codex project-scope MCP apply unexpectedly succeeded");
    const projectConfig = join(ctx.project, ".codex/config.toml");
    assert(!existsSync(projectConfig), "Codex project-scope apply created ignored project config");
    pass("codex project scope unsupported", { httpStatus: result.status });
  });
}

async function main() {
  let artifactRoot = null;
  try {
    artifactRoot = await mkdtemp(join(tmpdir(), "fmark-mcp-phase8-hot-"));
    report.artifactRoot = artifactRoot;

    for (const [runtime, scope] of [
      ["claude", "project"],
      ["claude", "user"],
      ["claude", "local"],
      ["codex", "user"],
      ["gemini", "project"],
      ["gemini", "user"],
    ]) {
      await supportedScopeCase(artifactRoot, runtime, scope);
    }

    for (const [runtime, scope] of [
      ["claude", "project"],
      ["claude", "local"],
      ["codex", "user"],
      ["gemini", "project"],
      ["gemini", "user"],
    ]) {
      await staleUpdateCase(artifactRoot, runtime, scope);
    }

    for (const [runtime, scope] of [
      ["claude", "project"],
      ["claude", "local"],
      ["codex", "user"],
      ["gemini", "project"],
    ]) {
      await blockedCase(artifactRoot, runtime, scope);
    }

    await codexProjectUnsupportedCase(artifactRoot);

    await writeFile(join(artifactRoot, "report.json"), JSON.stringify(report, null, 2));
    console.log(`HOT_TEST_REPORT ${join(artifactRoot, "report.json")}`);
    console.log(JSON.stringify({ run: RUN, artifactRoot, passes: report.checks.length }, null, 2));
  } catch (error) {
    if (artifactRoot === null) artifactRoot = await mkdtemp(join(tmpdir(), "fmark-mcp-phase8-hot-"));
    report.checks.push({
      name: "Phase 8 integration apply hot runner",
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
      for (const entry of await import("node:fs/promises").then((fs) => fs.readdir(artifactRoot))) {
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
