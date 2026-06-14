#!/usr/bin/env node
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
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const WORKSPACE = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const DIST_INDEX = join(WORKSPACE, "packages/kernel/dist/index.js");
const RENDERER_INDEX = join(WORKSPACE, "packages/renderer/dist/index.html");
const CHROME = "/usr/bin/google-chrome";
const RUN = `manual-v3-${Date.now().toString(36)}`;
const TOKEN = `${RUN}-token`;
const LAUNCH_MARKER = "<!-- fmark:launch-prompt:v1 -->";

if (process.env.FMARK_HOT !== "1") {
  console.error("Set FMARK_HOT=1 to run manual v3 regression hot checks.");
  process.exit(1);
}

const report = {
  run: RUN,
  artifactRoot: null,
  bootProject: null,
  secondProject: null,
  checks: [],
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
        cwd: options.cwd ?? WORKSPACE,
        env: options.env ?? process.env,
        timeout: options.timeoutMs ?? 60_000,
        maxBuffer: options.maxBuffer ?? 1024 * 1024 * 8,
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
    child.stdin?.end(options.stdin ?? "");
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
      return logs.join("").slice(-6000);
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

async function makeContext(artifactRoot) {
  const bootProject = join(artifactRoot, "boot-project");
  const secondProject = join(artifactRoot, "second-project");
  const home = join(artifactRoot, "home");
  const xdg = join(artifactRoot, "xdg");
  const codexHome = join(home, ".codex");
  const tmuxTmp = join(artifactRoot, "tmux");
  const chromeProfile = join(artifactRoot, "chrome");
  const captureDir = join(artifactRoot, "captures");
  for (const dir of [
    bootProject,
    secondProject,
    home,
    xdg,
    codexHome,
    tmuxTmp,
    chromeProfile,
    captureDir,
  ]) {
    await mkdir(dir, { recursive: true });
  }
  const captureRuntime = join(artifactRoot, "capture-runtime");
  await writeFile(
    captureRuntime,
    [
      "#!/bin/sh",
      'mkdir -p "$FMARK_CAPTURE_DIR"',
      'printf "%s\\n" "$*" > "$FMARK_CAPTURE_DIR/${F_MARK_AGENT_ID:-unknown}.txt"',
      "sleep 20",
      "",
    ].join("\n"),
    "utf8",
  );
  await chmod(captureRuntime, 0o755);
  return {
    bootProject,
    secondProject,
    home,
    xdg,
    codexHome,
    tmuxTmp,
    chromeProfile,
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

async function startChrome(ctx, debugPort) {
  const child = spawn(
    CHROME,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${ctx.chromeProfile}`,
      "about:blank",
    ],
    { env: ctx.env, stdio: ["ignore", "pipe", "pipe"] },
  );
  const started = Date.now();
  while (Date.now() - started < 15_000) {
    try {
      const res = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      if (res.ok) {
        const pages = await res.json();
        const page = Array.isArray(pages)
          ? pages.find((entry) => entry.type === "page" && entry.webSocketDebuggerUrl)
          : null;
        if (page?.webSocketDebuggerUrl) return { child, wsUrl: page.webSocketDebuggerUrl };
      }
    } catch {
      // keep polling
    }
    await sleep(100);
  }
  child.kill("SIGTERM");
  throw new Error("Chrome DevTools endpoint timed out");
}

class CdpPage {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
  }

  async open() {
    await new Promise((resolvePromise, reject) => {
      this.ws.once("open", resolvePromise);
      this.ws.once("error", reject);
    });
    this.ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const waiter = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) waiter.reject(new Error(JSON.stringify(msg.error)));
        else waiter.resolve(msg.result);
      }
    });
    await this.send("Page.enable");
    await this.send("Runtime.enable");
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text ?? "Runtime.evaluate failed");
    }
    return result.result?.value;
  }

  async waitForText(text, timeoutMs = 12_000) {
    const needle = JSON.stringify(text);
    await this.waitFor(`document.body && document.body.innerText.includes(${needle})`, timeoutMs);
  }

  async waitFor(expression, timeoutMs = 12_000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const value = await this.eval(expression);
      if (value) return value;
      await sleep(100);
    }
    throw new Error(`timed out waiting for ${expression}`);
  }

  close() {
    this.ws.close();
  }
}

function mcpEnv(baseEnv, project, agentId, sessionId) {
  return {
    ...baseEnv,
    F_MARK_PATH: project,
    F_MARK_AGENT_ID: agentId,
    F_MARK_SESSION_ID: sessionId,
    F_MARK_RUNTIME_ID: "codex",
  };
}

async function withMcpClient(project, env, fn) {
  const stderr = [];
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [DIST_INDEX, "mcp", "--path", project],
    cwd: project,
    env,
    stderr: "pipe",
  });
  transport.stderr?.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
  const client = new Client(
    { name: "fmark-manual-v3-hot", version: "0.0.1" },
    { capabilities: {} },
  );
  try {
    await client.connect(transport);
    return await fn(client, () => Buffer.concat(stderr).toString("utf8"));
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

async function waitForCapture(ctx, participantId, timeoutMs = 12_000) {
  const file = join(ctx.captureDir, `${participantId}.txt`);
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (existsSync(file)) return readFile(file, "utf8");
    await sleep(100);
  }
  throw new Error(`timed out waiting for capture file ${basename(file)}`);
}

async function firstUserId(port) {
  const body = await api(port, "GET", "/participants");
  const entry = Object.entries(body.participants ?? {}).find(
    ([, participant]) => participant?.kind === "user",
  );
  assert(entry !== undefined, "no user participant found");
  return entry[0];
}

async function readEvents(port, sessionId, projectPath) {
  return api(
    port,
    "GET",
    `/sessions/${encodeURIComponent(sessionId)}/events?path=${encodeURIComponent(projectPath)}`,
  );
}

function eventText(body) {
  return JSON.stringify(body.events ?? []);
}

async function main() {
  assert(existsSync(DIST_INDEX), "kernel dist is missing; run pnpm -F f-mark build");
  assert(existsSync(RENDERER_INDEX), "renderer dist is missing; run pnpm -F @f-mark/renderer build");
  assert(existsSync(CHROME), `${CHROME} is missing`);

  let artifactRoot = null;
  let kernel = null;
  let chrome = null;
  let page = null;
  try {
    artifactRoot = await mkdtemp(join(tmpdir(), "fmark-manual-v3-hot-"));
    report.artifactRoot = artifactRoot;
    const ctx = await makeContext(artifactRoot);
    report.bootProject = ctx.bootProject;
    report.secondProject = ctx.secondProject;
    const port = await freePort();
    const debugPort = await freePort();
    kernel = await startKernel(ctx.bootProject, port, ctx.env);
    pass("kernel started with explicit auth token", {
      bootProject: basename(ctx.bootProject),
      port,
    });

    const slug = `${RUN}-shared`;
    const bootSession = await api(port, "POST", "/sessions", { slug });
    const sessionId = bootSession.id;
    const bootUserId = await firstUserId(port);
    const oldMarker = `FMARK_${RUN}_OLD_PATH_EVENT`;
    await api(port, "POST", `/sessions/${encodeURIComponent(sessionId)}/events/prose`, {
      participant_id: bootUserId,
      content: oldMarker,
    });

    chrome = await startChrome(ctx, debugPort);
    page = new CdpPage(chrome.wsUrl);
    await page.open();
    await page.send("Page.navigate", {
      url: `http://127.0.0.1:${port}/?token=${encodeURIComponent(TOKEN)}`,
    });
    await page.waitForText(oldMarker);
    pass("production renderer shows boot-path session event", { sessionId, oldMarker });

    const secondSession = await api(port, "POST", "/sessions", {
      slug,
      path: ctx.secondProject,
    });
    assert(
      secondSession.id === sessionId,
      `expected same session id across paths; got ${sessionId} vs ${secondSession.id}`,
    );
    const tokenStat = await stat(join(ctx.secondProject, ".f-mark/.token"));
    const tokenValue = await readFile(join(ctx.secondProject, ".f-mark/.token"), "utf8");
    assert(tokenValue === TOKEN, "second project .f-mark/.token did not match kernel token");
    assert((tokenStat.mode & 0o777) === 0o600, "second project token mode was not 0600");
    pass("non-boot session creation mirrors .f-mark token", {
      tokenMode: "0600",
      sessionId,
    });

    const secondUserId = await firstUserId(port);
    const preSwitchMarker = `FMARK_${RUN}_SECOND_PATH_PRE_SWITCH`;
    await api(port, "POST", `/sessions/${encodeURIComponent(sessionId)}/events/prose`, {
      participant_id: secondUserId,
      content: preSwitchMarker,
    });
    await api(port, "POST", "/paths/active", { path: ctx.secondProject });
    await page.waitForText(preSwitchMarker);
    pass("production renderer refetches events on path switch", {
      sessionId,
      marker: preSwitchMarker,
    });

    const agentId = "ag-v3hot";
    await api(port, "POST", "/participants/register", {
      kind: "agent",
      name: "Manual V3 MCP",
      suggested_id: agentId,
      runtime_id: "codex",
    });
    await api(port, "POST", `/agents/${encodeURIComponent(agentId)}/link`, {
      session_id: sessionId,
    });
    const mcpMarker = `FMARK_${RUN}_MCP_SECOND_PATH`;
    await withMcpClient(
      ctx.secondProject,
      mcpEnv(ctx.env, ctx.secondProject, agentId, sessionId),
      async (client) => {
        const result = await client.callTool({
          name: "fmark_post_prose",
          arguments: { content: mcpMarker },
        });
        const text = toolText(result);
        assert(result.isError !== true, `MCP write failed: ${text}`);
        assert(text.includes("filename"), `MCP result missing filename: ${text}`);
      },
    );
    await page.waitForText(mcpMarker);
    const afterMcp = await readEvents(port, sessionId, ctx.secondProject);
    assert(eventText(afterMcp).includes(mcpMarker), "MCP marker was not persisted in second path");
    pass("stdio MCP writes succeed in non-boot path using mirrored token", {
      sessionId,
      agentId,
      marker: mcpMarker,
    });

    const codexAgentId = "ag-v3codex";
    await api(port, "PUT", "/runtimes/codex", {
      displayName: "Codex Capture",
      executable: ctx.captureRuntime,
      args: [],
      env: { FMARK_CAPTURE_DIR: ctx.captureDir },
      readyDelayMs: 0,
    });
    await api(port, "POST", "/managed-agents/spawn", {
      runtime_id: "codex",
      suggested_participant_id: codexAgentId,
      session_id: sessionId,
    });
    const launchPrompt = await waitForCapture(ctx, codexAgentId);
    assert(launchPrompt.includes(LAUNCH_MARKER), "captured launch prompt missing launch marker");
    assert(launchPrompt.includes("F-Mark agent onboarding"), "captured launch prompt missing onboarding guide");
    assert(launchPrompt.includes("fmark_post_prose"), "captured launch prompt missing MCP tool guidance");
    pass("managed Codex launch prompt is marker-tagged", { codexAgentId });

    const beforeLaunchHook = await readEvents(port, sessionId, ctx.secondProject);
    const launchHook = await run(
      process.execPath,
      [DIST_INDEX, "hook", "auto-stream", secondUserId, "--kind", "user"],
      {
        cwd: ctx.secondProject,
        env: mcpEnv(ctx.env, ctx.secondProject, codexAgentId, sessionId),
        stdin: JSON.stringify({
          cwd: ctx.secondProject,
          hook_event_name: "UserPromptSubmit",
          prompt: launchPrompt,
        }),
      },
    );
    assert(launchHook.code === 0, "launch-packet hook returned non-zero");
    const afterLaunchHook = await readEvents(port, sessionId, ctx.secondProject);
    assert(
      (afterLaunchHook.events ?? []).length === (beforeLaunchHook.events ?? []).length,
      "launch packet hook wrote an event",
    );
    assert(!eventText(afterLaunchHook).includes(LAUNCH_MARKER), "launch marker leaked into session feed");
    pass("Codex UserPromptSubmit launch packet is ignored by hook", { sessionId });

    const normalPromptMarker = `FMARK_${RUN}_NORMAL_USER_PROMPT`;
    await run(process.execPath, [DIST_INDEX, "hook", "auto-stream", secondUserId, "--kind", "user"], {
      cwd: ctx.secondProject,
      env: mcpEnv(ctx.env, ctx.secondProject, codexAgentId, sessionId),
      stdin: JSON.stringify({
        cwd: ctx.secondProject,
        hook_event_name: "UserPromptSubmit",
        prompt: normalPromptMarker,
      }),
    });
    const afterNormalHook = await readEvents(port, sessionId, ctx.secondProject);
    assert(eventText(afterNormalHook).includes(normalPromptMarker), "normal user hook prompt was not persisted");
    pass("normal Codex UserPromptSubmit hook still writes prose", {
      sessionId,
      marker: normalPromptMarker,
    });

    await writeFile(join(artifactRoot, "report.json"), JSON.stringify(report, null, 2));
    console.log(`HOT_TEST_REPORT ${join(artifactRoot, "report.json")}`);
    console.log(
      JSON.stringify(
        {
          run: RUN,
          artifactRoot,
          passes: report.checks.filter((check) => check.status === "PASS").length,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    if (artifactRoot === null) artifactRoot = await mkdtemp(join(tmpdir(), "fmark-manual-v3-hot-"));
    fail("manual v3 regression hot runner", error);
    if (page !== null) {
      try {
        const debug = await page.eval(`JSON.stringify({
          url: location.href,
          title: document.title,
          text: document.body ? document.body.innerText : "",
          html: document.documentElement ? document.documentElement.outerHTML.slice(0, 5000) : ""
        }, null, 2)`);
        await writeFile(join(artifactRoot, "page-debug.json"), debug, "utf8");
      } catch {
        // best-effort only
      }
    }
    await writeFile(join(artifactRoot, "report.failed.json"), JSON.stringify(report, null, 2));
    console.error(`HOT_TEST_FAILED_REPORT ${join(artifactRoot, "report.failed.json")}`);
    if (kernel !== null) console.error(kernel.logs());
    throw error;
  } finally {
    if (page !== null) page.close();
    if (chrome !== null) {
      chrome.child.kill("SIGTERM");
      await sleep(500);
      if (chrome.child.exitCode === null) chrome.child.kill("SIGKILL");
    }
    if (kernel !== null) await kernel.stop();
    if (artifactRoot !== null && process.env.FMARK_HOT_KEEP !== "1") {
      const reportPath = existsSync(join(artifactRoot, "report.json"))
        ? join(artifactRoot, "report.json")
        : join(artifactRoot, "report.failed.json");
      const saved = existsSync(reportPath) ? await readFile(reportPath, "utf8") : null;
      for (const entry of await readdir(artifactRoot)) {
        if (entry === "report.json" || entry === "report.failed.json" || entry === "page-debug.json") {
          continue;
        }
        await rm(join(artifactRoot, entry), { recursive: true, force: true });
      }
      if (saved !== null) await writeFile(reportPath, saved, "utf8");
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
