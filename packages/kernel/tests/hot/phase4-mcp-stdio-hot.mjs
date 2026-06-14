#!/usr/bin/env node
import { spawn, execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SERVER_NAME = "phase4-fmark-echo";
const RUN_ID = `phase4-${Date.now().toString(36)}`;
const THIS_FILE = fileURLToPath(import.meta.url);
const KERNEL_DIR = resolve(dirname(THIS_FILE), "../..");
const WORKSPACE = resolve(KERNEL_DIR, "../..");
const FIXTURE = join(KERNEL_DIR, "tests/mcp/fixtures/phase4-echo-server.mjs");

if (process.env.FMARK_HOT !== "1") {
  console.error("Set FMARK_HOT=1 to run Phase 4 MCP stdio hot checks.");
  process.exit(1);
}

const report = {
  run: RUN_ID,
  fixture: FIXTURE,
  workspace: WORKSPACE,
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

function textFromToolResult(result) {
  const content = Array.isArray(result?.content) ? result.content : [];
  return content
    .filter((entry) => entry?.type === "text")
    .map((entry) => entry.text)
    .join("\n");
}

function run(command, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? 20_000;
  return new Promise((resolvePromise, reject) => {
    const child = execFile(
      command,
      args,
      {
        cwd: options.cwd ?? WORKSPACE,
        env: options.env ?? process.env,
        timeout: timeoutMs,
        maxBuffer: options.maxBuffer ?? 1024 * 1024,
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
          const message = `${result.command} failed with code ${result.code}${result.stderr ? `: ${result.stderr}` : ""}`;
          const wrapped = new Error(message);
          wrapped.result = result;
          reject(wrapped);
          return;
        }
        resolvePromise(result);
      },
    );

    child.on("error", reject);
  });
}

async function sdkClientProbe() {
  const stderrChunks = [];
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [FIXTURE],
    cwd: WORKSPACE,
    env: process.env,
    stderr: "pipe",
  });
  transport.stderr?.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));
  const client = new Client({ name: "fmark-phase4-sdk-hot", version: "0.0.1" }, { capabilities: {} });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert(
      tools.tools.some((tool) => tool.name === "phase4_echo"),
      "SDK client did not see phase4_echo",
    );
    const result = await client.callTool({
      name: "phase4_echo",
      arguments: { message: "sdk-probe", tag: RUN_ID },
    });
    const text = textFromToolResult(result);
    assert(text.includes(`F_MARK_PHASE4_ECHO:${RUN_ID}:sdk-probe`), "SDK echo result missing marker");
    pass("SDK stdio client list/call", {
      observed: text,
      stderr: Buffer.concat(stderrChunks).toString("utf8"),
    });
  } finally {
    await client.close().catch(() => {});
  }
}

async function rawJsonRpcProbe() {
  const child = spawn(process.execPath, [FIXTURE], {
    cwd: WORKSPACE,
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const pending = new Map();
  const stdoutLines = [];
  const stderrChunks = [];
  let stdoutBuffer = "";

  function waitFor(id, timeoutMs = 5_000) {
    return new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timed out waiting for JSON-RPC response ${id}`));
      }, timeoutMs);
      pending.set(id, {
        resolve: (message) => {
          clearTimeout(timer);
          resolvePromise(message);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
    });
  }

  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk.toString("utf8");
    let index = stdoutBuffer.indexOf("\n");
    while (index >= 0) {
      const line = stdoutBuffer.slice(0, index).trim();
      stdoutBuffer = stdoutBuffer.slice(index + 1);
      if (line) {
        stdoutLines.push(line);
        let parsed;
        try {
          parsed = JSON.parse(line);
        } catch (error) {
          for (const waiter of pending.values()) waiter.reject(error);
          pending.clear();
          return;
        }
        if (parsed.id !== undefined && pending.has(parsed.id)) {
          pending.get(parsed.id).resolve(parsed);
          pending.delete(parsed.id);
        }
      }
      index = stdoutBuffer.indexOf("\n");
    }
  });
  child.stderr.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));

  const send = (message) => {
    child.stdin.write(`${JSON.stringify(message)}\n`);
  };

  try {
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "fmark-phase4-raw-hot", version: "0.0.1" },
      },
    });
    const init = await waitFor(1);
    assert(!init.error, `initialize returned error: ${JSON.stringify(init.error)}`);
    send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    const tools = await waitFor(2);
    assert(
      tools.result?.tools?.some((tool) => tool.name === "phase4_echo"),
      "raw JSON-RPC tools/list did not include phase4_echo",
    );
    send({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "phase4_echo",
        arguments: { message: "raw-probe", tag: RUN_ID },
      },
    });
    const called = await waitFor(3);
    const text = textFromToolResult(called.result);
    assert(text.includes(`F_MARK_PHASE4_ECHO:${RUN_ID}:raw-probe`), "raw echo result missing marker");
    assert(stdoutLines.every((line) => JSON.parse(line).jsonrpc === "2.0"), "stdout contained non-protocol output");
    pass("Raw JSON-RPC stdio protocol purity", {
      stdoutLines: stdoutLines.length,
      observed: text,
      stderr: Buffer.concat(stderrChunks).toString("utf8"),
    });
  } finally {
    child.kill("SIGTERM");
  }
}

async function readMaybe(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

async function vendorConfigProbes() {
  const artifactRoot = await mkdtemp(join(tmpdir(), "fmark-mcp-phase4-hot-"));
  const project = join(artifactRoot, "project");
  const home = join(artifactRoot, "home");
  const xdg = join(artifactRoot, "xdg");
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
  report.artifactRoot = artifactRoot;

  const env = {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: xdg,
    CODEX_HOME: codexHome,
    NO_COLOR: "1",
  };
  const command = process.execPath;
  const commandArgs = [FIXTURE];

  const vendorRuns = [
    {
      vendor: "claude",
      add: ["mcp", "add", "--scope", "project", SERVER_NAME, "--", command, ...commandArgs],
      list: ["mcp", "list"],
      configPath: join(project, ".mcp.json"),
      expects: [SERVER_NAME, "phase4-echo-server.mjs"],
    },
    {
      vendor: "codex",
      add: ["mcp", "add", SERVER_NAME, "--", command, ...commandArgs],
      list: ["mcp", "list", "--json"],
      configPath: join(codexHome, "config.toml"),
      expects: [SERVER_NAME, "phase4-echo-server.mjs"],
    },
    {
      vendor: "gemini",
      add: ["mcp", "add", "--scope", "project", "--transport", "stdio", "--trust", SERVER_NAME, command, ...commandArgs],
      list: ["mcp", "list"],
      configPath: join(project, ".gemini/settings.json"),
      expects: [SERVER_NAME, "phase4-echo-server.mjs", "Connected"],
      forbids: ["Disabled", "untrusted"],
    },
  ];

  for (const vendorRun of vendorRuns) {
    const add = await run(vendorRun.vendor, vendorRun.add, { cwd: project, env, timeoutMs: 30_000 });
    const list = await run(vendorRun.vendor, vendorRun.list, { cwd: project, env, timeoutMs: 30_000 });
    const config = await readMaybe(vendorRun.configPath);
    assert(config, `${vendorRun.vendor} did not create ${vendorRun.configPath}`);
    for (const expected of vendorRun.expects) {
      assert(
        `${add.stdout}\n${add.stderr}\n${list.stdout}\n${list.stderr}\n${config}`.includes(expected),
        `${vendorRun.vendor} output/config missing ${expected}`,
      );
    }
    for (const forbidden of vendorRun.forbids ?? []) {
      assert(
        !`${add.stdout}\n${add.stderr}\n${list.stdout}\n${list.stderr}\n${config}`.includes(forbidden),
        `${vendorRun.vendor} output/config unexpectedly included ${forbidden}`,
      );
    }
    report.vendors[vendorRun.vendor] = {
      add: {
        command: add.command,
        stdout: add.stdout,
        stderr: add.stderr,
      },
      list: {
        command: list.command,
        stdout: list.stdout,
        stderr: list.stderr,
      },
      configPath: vendorRun.configPath,
      config,
    };
    pass(`${vendorRun.vendor} isolated MCP add/list`, {
      configPath: vendorRun.configPath,
    });
  }

  if (process.env.FMARK_HOT_KEEP !== "1") {
    await rm(project, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
    await rm(xdg, { recursive: true, force: true });
    report.cleanup = "removed isolated project/home/xdg directories; retained report.json";
  } else {
    report.cleanup = "retained isolated project/home/xdg directories because FMARK_HOT_KEEP=1";
  }
  pass("Vendor config isolation cleanup", { artifactRoot, cleanup: report.cleanup });
  await writeFile(join(artifactRoot, "report.json"), JSON.stringify(report, null, 2));
}

async function main() {
  try {
    await sdkClientProbe();
    await rawJsonRpcProbe();
    await vendorConfigProbes();
    console.log(`HOT_TEST_REPORT ${join(report.artifactRoot, "report.json")}`);
    console.log(JSON.stringify({
      run: report.run,
      fixture: report.fixture,
      artifactRoot: report.artifactRoot,
      passes: report.checks.filter((check) => check.status === "PASS").length,
      vendors: Object.keys(report.vendors),
    }, null, 2));
  } catch (error) {
    fail("Phase 4 hot runner", error);
    if (report.artifactRoot) {
      await writeFile(join(report.artifactRoot, "report.failed.json"), JSON.stringify(report, null, 2));
      console.error(`HOT_TEST_FAILED_REPORT ${join(report.artifactRoot, "report.failed.json")}`);
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
