#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const WORKSPACE = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const DIST_INDEX = join(WORKSPACE, "packages/kernel/dist/index.js");
const RUN = `phase11-${Date.now().toString(36)}`;
const TOKEN = `${RUN}-token`;

if (process.env.FMARK_HOT !== "1") {
  console.error("Set FMARK_HOT=1 to run Phase 11 MCP full tools hot checks.");
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

async function http(port, path, init = {}) {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("Authorization", `Bearer ${TOKEN}`);
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { ...init, headers });
  const text = await res.text();
  let parsed = text;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} failed ${res.status}: ${text}`);
  return parsed;
}

async function createSessionAndAgent(port, slug, participantId) {
  const session = await http(port, "/sessions", {
    method: "POST",
    body: JSON.stringify({ slug }),
  });
  await http(port, "/participants/register", {
    method: "POST",
    body: JSON.stringify({
      kind: "agent",
      name: "Phase 11 Agent",
      suggested_id: participantId,
    }),
  });
  await http(port, `/agents/${encodeURIComponent(participantId)}/link`, {
    method: "POST",
    body: JSON.stringify({ session_id: session.id }),
  });
  return { sessionId: session.id, participantId };
}

function mcpEnv(baseEnv, project, agent) {
  return {
    ...baseEnv,
    F_MARK_PATH: project,
    F_MARK_AGENT_ID: agent.participantId,
    F_MARK_SESSION_ID: agent.sessionId,
    F_MARK_RUNTIME_ID: "codex",
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
  const client = new Client({ name: "fmark-phase11-hot", version: "0.0.1" }, { capabilities: {} });
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

async function protocolHotChecks(project, port, env, agent) {
  const marker = `FMARK_${RUN}_FULL_TOOLS`;
  await withMcpClient(project, mcpEnv(env, project, agent), async (client) => {
    const tools = await client.listTools();
    const names = new Set(tools.tools.map((tool) => tool.name));
    const expected = [
      "fmark_list_sessions",
      "fmark_create_session",
      "fmark_list_participants",
      "fmark_register_agent",
      "fmark_link_agent",
      "fmark_read_events",
      "fmark_read_event",
      "fmark_get_todos",
      "fmark_post_prose",
      "fmark_post_todo",
      "fmark_post_tool_use",
      "fmark_post_choices",
      "fmark_post_choice",
      "fmark_post_flow",
      "fmark_post_html",
      "fmark_post_file_ref",
      "fmark_end_turn",
    ];
    for (const name of expected) assert(names.has(name), `missing MCP tool ${name}`);

    parseToolJson(await client.callTool({ name: "fmark_list_sessions", arguments: {} }));
    parseToolJson(await client.callTool({ name: "fmark_create_session", arguments: { slug: `${RUN}-extra` } }));
    parseToolJson(await client.callTool({ name: "fmark_list_participants", arguments: {} }));
    const registered = parseToolJson(await client.callTool({
      name: "fmark_register_agent",
      arguments: { name: "Phase 11 Second", suggested_id: "ag-p11-second" },
    }));
    assert(registered.id === "ag-p11-second", "register_agent returned wrong id");
    parseToolJson(await client.callTool({
      name: "fmark_link_agent",
      arguments: { participant_id: "ag-p11-second", session_id: agent.sessionId },
    }));

    const prose = parseToolJson(await client.callTool({
      name: "fmark_post_prose",
      arguments: { content: marker, name: "Phase 11 Anchor" },
    }));
    const todo = parseToolJson(await client.callTool({
      name: "fmark_post_todo",
      arguments: {
        id: "todo-p11",
        title: "Phase 11 todo",
        status: "open",
        assigned_to: agent.participantId,
      },
    }));
    parseToolJson(await client.callTool({
      name: "fmark_post_tool_use",
      arguments: {
        tool_name: "phase11_tool",
        tool_use_id: "tool-use-p11",
        input: { marker },
        result: { ok: true },
        success: true,
      },
    }));
    parseToolJson(await client.callTool({
      name: "fmark_post_choices",
      arguments: {
        id: "choice-p11",
        question: "Pick one",
        options: [{ id: "a", label: "A" }],
        multi: false,
      },
    }));
    parseToolJson(await client.callTool({
      name: "fmark_post_choice",
      arguments: { choices_id: "choice-p11", selected: ["a"] },
    }));
    parseToolJson(await client.callTool({
      name: "fmark_post_flow",
      arguments: {
        id: "flow-p11",
        title: "Phase 11 flow",
        nodes: [{ id: "n1", label: "Start" }],
        edges: [],
      },
    }));
    parseToolJson(await client.callTool({
      name: "fmark_post_html",
      arguments: {
        html: `<strong>${marker}</strong>`,
        title: "Phase 11 HTML",
      },
    }));
    parseToolJson(await client.callTool({
      name: "fmark_post_file_ref",
      arguments: {
        id: "file-p11",
        path: "artifacts/phase11.txt",
        mime_type: "text/plain",
        description: marker,
      },
    }));
    parseToolJson(await client.callTool({ name: "fmark_end_turn", arguments: {} }));

    const events = parseToolJson(await client.callTool({ name: "fmark_read_events", arguments: {} }));
    const kinds = new Set(events.events.map((event) => event.kind));
    for (const kind of ["prose", "todo", "tool-use", "choices", "choice", "flow", "html", "file", "turn-end"]) {
      assert(kinds.has(kind), `missing event kind ${kind}`);
    }
    const one = await client.callTool({
      name: "fmark_read_event",
      arguments: { filename: prose.filename },
    });
    assert(toolText(one).includes(marker), "read_event did not return prose marker");
    const todos = parseToolJson(await client.callTool({ name: "fmark_get_todos", arguments: {} }));
    assert(JSON.stringify(todos).includes("todo-p11"), "get_todos missing todo-p11");
    assert(todo.kind === "todo", "todo response wrong kind");

    for (const uri of ["fmark://guide", "fmark://sessions", "fmark://participants", "fmark://events", "fmark://todos"]) {
      const resource = await client.readResource({ uri });
      const text = (resource.contents ?? []).map((entry) => entry.text ?? "").join("\n");
      assert(text.length > 0, `${uri} resource was empty`);
    }
    pass("SDK MCP full tool/resource matrix", { tools: expected.length });
  });

  const body = await http(port, `/sessions/${encodeURIComponent(agent.sessionId)}/events`);
  const raw = JSON.stringify(body);
  assert(raw.includes(marker), "kernel event feed missing phase11 marker");
}

async function vendorListChecks(project, home, codexHome, env) {
  await mkdir(join(project, ".gemini"), { recursive: true });
  await mkdir(join(home, ".gemini"), { recursive: true });
  await writeFile(
    join(home, ".gemini/trustedFolders.json"),
    JSON.stringify({ [project]: "TRUST_FOLDER" }, null, 2),
  );
  const command = process.execPath;
  const args = [DIST_INDEX, "mcp", "--path", project];
  await writeFile(
    join(project, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        fmark: {
          type: "stdio",
          command,
          args,
          env: { F_MARK_MCP_VERSION: "phase5-stdio-v1" },
        },
      },
    }, null, 2),
  );
  await writeFile(
    join(codexHome, "config.toml"),
    [
      "[mcp_servers.fmark]",
      `command = "${command}"`,
      `args = [${args.map((arg) => JSON.stringify(arg)).join(", ")}]`,
      "",
      "[mcp_servers.fmark.env]",
      'F_MARK_MCP_VERSION = "phase5-stdio-v1"',
      "",
    ].join("\n"),
  );
  await writeFile(
    join(project, ".gemini/settings.json"),
    JSON.stringify({
      mcpServers: {
        fmark: {
          command,
          args,
          env: { F_MARK_MCP_VERSION: "phase5-stdio-v1" },
          trust: false,
        },
      },
    }, null, 2),
  );

  const claude = await run("claude", ["mcp", "list"], { cwd: project, env });
  assert(`${claude.stdout}\n${claude.stderr}`.includes("fmark"), "Claude did not list fmark");
  assert(`${claude.stdout}\n${claude.stderr}`.includes("Connected"), "Claude did not connect fmark");

  const codex = await run("codex", ["mcp", "list", "--json"], { cwd: project, env });
  const parsed = JSON.parse(codex.stdout);
  assert(parsed.some((entry) => entry.name === "fmark" && entry.enabled === true), "Codex did not list enabled fmark");

  const gemini = await run("gemini", ["mcp", "list"], { cwd: project, env });
  assert(`${gemini.stdout}\n${gemini.stderr}`.includes("fmark"), "Gemini did not list fmark");
  assert(`${gemini.stdout}\n${gemini.stderr}`.includes("Connected"), "Gemini did not connect fmark");

  pass("real vendor MCP list checks", { vendors: ["claude", "codex", "gemini"] });
}

async function main() {
  let kernel = null;
  const artifactRoot = await mkdtemp(join(tmpdir(), "fmark-mcp-phase11-hot-"));
  const project = join(artifactRoot, "project");
  const home = join(artifactRoot, "home");
  const xdg = join(artifactRoot, "xdg");
  const codexHome = join(home, ".codex");
  await mkdir(project, { recursive: true });
  await mkdir(home, { recursive: true });
  await mkdir(xdg, { recursive: true });
  await mkdir(codexHome, { recursive: true });
  report.artifactRoot = artifactRoot;
  const env = {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: xdg,
    CODEX_HOME: codexHome,
    NO_COLOR: "1",
  };
  const port = 9700 + Math.floor(Math.random() * 500);
  try {
    kernel = await startKernel(project, port, env);
    const agent = await createSessionAndAgent(port, `${RUN}-main`, "ag-p11-main");
    await protocolHotChecks(project, port, env, agent);
    await vendorListChecks(project, home, codexHome, env);
    await writeFile(join(artifactRoot, "report.json"), JSON.stringify(report, null, 2));
    console.log(`HOT_TEST_REPORT ${join(artifactRoot, "report.json")}`);
    console.log(JSON.stringify({ run: RUN, artifactRoot, passes: report.checks.length }, null, 2));
  } catch (error) {
    report.checks.push({
      name: "Phase 11 MCP full tools hot runner",
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
