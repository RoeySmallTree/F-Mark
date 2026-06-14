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
import WebSocket from "ws";

const WORKSPACE = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const DIST_INDEX = join(WORKSPACE, "packages/kernel/dist/index.js");
const RENDERER_INDEX = join(WORKSPACE, "packages/renderer/dist/index.html");
const CHROME = "/usr/bin/google-chrome";
const RUN = `phase10-${Date.now().toString(36)}`;
const TOKEN = `${RUN}-token`;

if (process.env.FMARK_HOT !== "1") {
  console.error("Set FMARK_HOT=1 to run Phase 10 integration UI hot checks.");
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

async function makeContext(artifactRoot) {
  const project = join(artifactRoot, "project");
  const home = join(artifactRoot, "home");
  const xdg = join(artifactRoot, "xdg");
  const codexHome = join(home, ".codex");
  const tmuxTmp = join(artifactRoot, "tmux");
  const chromeProfile = join(artifactRoot, "chrome");
  const captureDir = join(artifactRoot, "captures");
  await mkdir(project, { recursive: true });
  await mkdir(home, { recursive: true });
  await mkdir(xdg, { recursive: true });
  await mkdir(codexHome, { recursive: true });
  await mkdir(tmuxTmp, { recursive: true, mode: 0o700 });
  await mkdir(chromeProfile, { recursive: true });
  await mkdir(captureDir, { recursive: true });
  await mkdir(join(home, ".gemini"), { recursive: true });
  await writeFile(
    join(home, ".gemini/trustedFolders.json"),
    JSON.stringify({ [project]: "TRUST_FOLDER" }, null, 2),
  );
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
  );
  await chmod(captureRuntime, 0o755);
  return {
    project,
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

async function createSession(port) {
  const created = await api(port, "POST", "/sessions", { slug: `${RUN}-ui` });
  return created.session?.id ?? created.id;
}

async function configureCaptureClaude(port, ctx) {
  await api(port, "PUT", "/runtimes/claude", {
    displayName: "Claude Code",
    executable: ctx.captureRuntime,
    args: [],
    env: { FMARK_CAPTURE_DIR: ctx.captureDir },
    readyDelayMs: 0,
  });
}

async function captureFiles(ctx) {
  try {
    return (await readdir(ctx.captureDir))
      .filter((name) => name.endsWith(".txt"))
      .sort();
  } catch {
    return [];
  }
}

async function waitForCaptureCount(ctx, count, timeoutMs = 12_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const files = await captureFiles(ctx);
    if (files.length >= count) return files;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`timed out waiting for ${count} capture files`);
}

async function readLatestCapture(ctx) {
  const files = await captureFiles(ctx);
  assert(files.length > 0, "no capture files found");
  return readFile(join(ctx.captureDir, files[files.length - 1]), "utf8");
}

async function deleteAllAgents(port) {
  const listed = await api(port, "GET", "/managed-agents");
  for (const agent of listed.agents ?? []) {
    const tok = await api(
      port,
      "GET",
      `/managed-agents/${encodeURIComponent(agent.participant_id)}/confirm-token`,
    );
    await api(
      port,
      "DELETE",
      `/managed-agents/${encodeURIComponent(agent.participant_id)}?confirm=${encodeURIComponent(tok.token)}`,
    );
  }
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
        if (page?.webSocketDebuggerUrl) {
          return { child, wsUrl: page.webSocketDebuggerUrl };
        }
      }
    } catch {
      // keep polling
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
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
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject });
      this.ws.send(payload);
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

  async waitFor(expression, timeoutMs = 10_000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const value = await this.eval(expression);
      if (value) return value;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
    }
    throw new Error(`timed out waiting for ${expression}`);
  }

  close() {
    this.ws.close();
  }
}

const CLICK_PLUS = `
(() => {
  const button = document.querySelector('button[aria-label="Add agent or terminal"]');
  if (!button) return false;
  button.click();
  return true;
})()
`;

const CLICK_CLAUDE = `
(() => {
  const buttons = [...document.querySelectorAll('button[role="menuitem"]')];
  const button = buttons.find((item) => item.textContent && item.textContent.includes('Claude'));
  if (!button) return false;
  button.click();
  return true;
})()
`;

const CLICK_SETUP = `
(() => {
  const modal = document.querySelector('[data-modal="integration-setup"]');
  if (!modal) return false;
  const buttons = [...modal.querySelectorAll('button')];
  const button = buttons.find((item) => item.textContent && /Setup|Update/.test(item.textContent) && !item.disabled);
  if (!button || button.disabled) return false;
  button.click();
  return true;
})()
`;

const CLICK_LAUNCH = `
(() => {
  const modal = document.querySelector('[data-modal="integration-setup"]');
  if (!modal) return false;
  const buttons = [...modal.querySelectorAll('button')];
  const button = buttons.find((item) => item.textContent && item.textContent.trim() === 'Launch');
  if (!button || button.disabled) return false;
  button.click();
  return true;
})()
`;

async function main() {
  let artifactRoot = null;
  let kernel = null;
  let chrome = null;
  let page = null;
  try {
    assert(existsSync(RENDERER_INDEX), "renderer dist is missing; run pnpm -F @f-mark/renderer build");
    artifactRoot = await mkdtemp(join(tmpdir(), "fmark-mcp-phase10-hot-"));
    report.artifactRoot = artifactRoot;
    const ctx = await makeContext(artifactRoot);
    const port = 9900 + Math.floor(Math.random() * 200);
    const debugPort = 10400 + Math.floor(Math.random() * 300);
    kernel = await startKernel(ctx.project, port, ctx.env);
    const sessionId = await createSession(port);
    await configureCaptureClaude(port, ctx);

    chrome = await startChrome(ctx, debugPort);
    page = new CdpPage(chrome.wsUrl);
    await page.open();
    await page.send("Page.navigate", {
      url: `http://127.0.0.1:${port}/?token=${encodeURIComponent(TOKEN)}`,
    });
    await page.waitFor("Boolean(document.querySelector('button[aria-label=\"Add agent or terminal\"]'))");
    await page.waitFor(`document.body.textContent.includes(${JSON.stringify(sessionId)}) || document.body.textContent.includes(${JSON.stringify(`${RUN}-ui`)})`);

    assert(await page.eval(CLICK_PLUS), "plus button click failed");
    assert(await page.eval(CLICK_CLAUDE), "Claude menu click failed");
    await page.waitFor("Boolean(document.querySelector('[data-modal=\"integration-setup\"]'))");
    const missingText = await page.eval("document.querySelector('[data-modal=\"integration-setup\"]')?.textContent ?? ''");
    assert(missingText.includes("Claude"), "setup modal did not show Claude");
    assert(missingText.includes("Globally"), "setup modal did not default to global setup");
    assert(missingText.includes("MCP"), "setup modal did not show MCP panel");
    assert(missingText.includes("Setup"), "setup modal did not show setup action");
    assert(!missingText.includes(".mcp.json"), "setup modal exposed MCP config path");
    assert(!missingText.includes(".claude/settings.json"), "setup modal exposed hook config path");
    assert(await page.eval(CLICK_SETUP), "Setup click failed");
    await page.waitFor(
      "document.querySelector('[data-modal=\"integration-setup\"]')?.textContent.includes(\"We're all set up and ready to go\")",
    );
    assert(await page.eval(CLICK_LAUNCH), "Launch click failed after setup");
    await waitForCaptureCount(ctx, 1);
    const firstPrompt = await readLatestCapture(ctx);
    assert(firstPrompt.includes("fmark_post_prose"), "first UI launch prompt missing MCP prose tool");
    assert(!firstPrompt.includes("curl -X POST"), "first UI launch prompt included curl");
    const claudeConfig = await readFile(join(ctx.home, ".claude.json"), "utf8");
    assert(claudeConfig.includes("F_MARK_MCP_VERSION"), "Claude global MCP config missing marker");
    assert(!claudeConfig.includes(TOKEN), "Claude global MCP config leaked bearer token");
    const claudeHooks = await readFile(join(ctx.home, ".claude", "settings.json"), "utf8");
    assert(claudeHooks.includes("hook auto-stream"), "Claude global hook config missing auto stream command");
    pass("missing MCP opens simple global setup and launches", { sessionId });

    await page.waitFor("!document.querySelector('[data-modal=\"integration-setup\"]')");
    assert(await page.eval(CLICK_PLUS), "plus button click failed for green path");
    assert(await page.eval(CLICK_CLAUDE), "Claude menu click failed for green path");
    await waitForCaptureCount(ctx, 2);
    const modalAfterGreen = await page.eval("Boolean(document.querySelector('[data-modal=\"integration-setup\"]'))");
    assert(!modalAfterGreen, "installed preflight still opened setup modal");
    pass("installed MCP launches directly");

    await deleteAllAgents(port);
    const beforeBlocked = (await captureFiles(ctx)).length;
    await writeFile(join(ctx.project, ".mcp.json"), "{ nope");
    assert(await page.eval(CLICK_PLUS), "plus button click failed for blocked path");
    assert(await page.eval(CLICK_CLAUDE), "Claude menu click failed for blocked path");
    await page.waitFor("Boolean(document.querySelector('[data-modal=\"integration-setup\"]'))");
    const blockedText = await page.eval("document.querySelector('[data-modal=\"integration-setup\"]')?.textContent ?? ''");
    assert(blockedText.includes("Blocked"), "blocked config did not show blocked status");
    const disabled = await page.eval(`
      (() => {
        const modal = document.querySelector('[data-modal="integration-setup"]');
        const buttons = modal ? [...modal.querySelectorAll('button')] : [];
        const primary = buttons.find((item) => item.classList.contains('btn-solid'));
        return Boolean(primary && primary.disabled);
      })()
    `);
    assert(disabled, "blocked config primary action was not disabled");
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 600));
    const afterBlocked = (await captureFiles(ctx)).length;
    assert(afterBlocked === beforeBlocked, "blocked config spawned a runtime");
    pass("blocked MCP opens modal without spawn");

    await deleteAllAgents(port);
    await writeFile(join(artifactRoot, "report.json"), JSON.stringify(report, null, 2));
    console.log(`HOT_TEST_REPORT ${join(artifactRoot, "report.json")}`);
    console.log(JSON.stringify({ run: RUN, artifactRoot, passes: report.checks.length }, null, 2));
  } catch (error) {
    if (artifactRoot === null) artifactRoot = await mkdtemp(join(tmpdir(), "fmark-mcp-phase10-hot-"));
    if (page !== null) {
      try {
        const debug = await page.eval(`JSON.stringify({
          url: location.href,
          title: document.title,
          text: document.body ? document.body.innerText : "",
          html: document.documentElement ? document.documentElement.outerHTML.slice(0, 4000) : ""
        }, null, 2)`);
        await writeFile(join(artifactRoot, "page-debug.json"), debug);
      } catch {
        // best-effort diagnostics only
      }
    }
    report.checks.push({
      name: "Phase 10 integration UI hot runner",
      status: "FAIL",
      error: error instanceof Error ? error.message : String(error),
    });
    await writeFile(join(artifactRoot, "report.failed.json"), JSON.stringify(report, null, 2));
    console.error(`HOT_TEST_FAILED_REPORT ${join(artifactRoot, "report.failed.json")}`);
    throw error;
  } finally {
    if (page !== null) page.close();
    if (chrome !== null) {
      chrome.child.kill("SIGTERM");
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
      if (chrome.child.exitCode === null) chrome.child.kill("SIGKILL");
    }
    if (kernel !== null) await kernel.stop();
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
