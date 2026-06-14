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
const RUN = `phase14-${Date.now().toString(36)}`;
const TOKEN = `${RUN}-token`;
const LAUNCH_MARKER = "<!-- fmark:launch-prompt:v1 -->";

if (process.env.FMARK_HOT !== "1") {
  console.error("Set FMARK_HOT=1 to run Phase 14 Agents UI hot checks.");
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
        timeout: options.timeoutMs ?? 25_000,
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
  const captureRuntime = join(artifactRoot, "capture-runtime");
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

async function createSession(port) {
  const session = await api(port, "POST", "/sessions", { slug: `${RUN}-ui` });
  return session.id;
}

async function upsertCaptureRuntime(port, ctx, id) {
  await api(port, "PUT", `/runtimes/${encodeURIComponent(id)}`, {
    displayName: id,
    executable: ctx.captureRuntime,
    args: [],
    env: { FMARK_CAPTURE_DIR: ctx.captureDir },
    readyDelayMs: 0,
  });
}

async function spawnCaptureAgent(port, runtimeId, sessionId, participantId) {
  return api(port, "POST", "/managed-agents/spawn", {
    runtime_id: runtimeId,
    session_id: sessionId,
    suggested_participant_id: participantId,
  });
}

async function waitForCaptureContains(ctx, participantId, needles, timeoutMs = 12_000) {
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

function rowScript(participantId, inner) {
  return `
(() => {
  const rows = [...document.querySelectorAll('.agent-status-row')];
  const row = rows.find((item) => item.textContent && item.textContent.includes(${JSON.stringify(participantId)}));
  if (!row) return false;
  ${inner}
})()
`;
}

function clickRowButton(participantId, title) {
  return rowScript(participantId, `
  const button = [...row.querySelectorAll('button')].find((item) => item.title === ${JSON.stringify(title)});
  if (!button || button.disabled) return false;
  button.click();
  return true;
`);
}

async function main() {
  let artifactRoot = null;
  let kernel = null;
  let chrome = null;
  let page = null;
  try {
    assert(existsSync(RENDERER_INDEX), "renderer dist is missing; run pnpm -F @f-mark/renderer build");
    artifactRoot = await mkdtemp(join(tmpdir(), "fmark-mcp-phase14-hot-"));
    report.artifactRoot = artifactRoot;
    const ctx = await makeContext(artifactRoot);
    const port = 11_200 + Math.floor(Math.random() * 300);
    const debugPort = 11_700 + Math.floor(Math.random() * 300);
    kernel = await startKernel(ctx.project, port, ctx.env);
    const sessionId = await createSession(port);
    await upsertCaptureRuntime(port, ctx, "claude");
    await upsertCaptureRuntime(port, ctx, "gemini");
    const agentA = "ag-p14-a";
    const agentB = "ag-p14-b";
    const spawnedA = await spawnCaptureAgent(port, "claude", sessionId, agentA);
    const spawnedB = await spawnCaptureAgent(port, "gemini", sessionId, agentB);
    await waitForCaptureContains(ctx, agentA, [
      LAUNCH_MARKER,
      "# F-Mark agent onboarding",
      sessionId,
    ]);
    await waitForCaptureContains(ctx, agentB, [
      LAUNCH_MARKER,
      "# F-Mark agent onboarding",
      sessionId,
    ]);

    chrome = await startChrome(ctx, debugPort);
    page = new CdpPage(chrome.wsUrl);
    await page.open();
    await page.send("Page.navigate", {
      url: `http://127.0.0.1:${port}/?token=${encodeURIComponent(TOKEN)}`,
    });
    await page.waitFor("Boolean(document.querySelector('.right-tabs'))");
    await page.waitFor("document.body.textContent.includes('Agents')");
    assert(
      await page.eval(`
(() => {
  const button = [...document.querySelectorAll('.right-tabs button')].find((item) => item.textContent && item.textContent.includes('Agents'));
  if (!button) return false;
  button.click();
  return true;
})()
`),
      "Agents tab click failed",
    );
    await page.waitFor("Boolean(document.querySelector('[data-testid=\"right-agents\"]'))");
    await page.waitFor(`document.body.textContent.includes(${JSON.stringify(agentB)})`);

    assert(await page.eval(clickRowButton(agentA, "Pause")), "pause click failed");
    await page.waitFor(rowScript(agentA, "return row.textContent.includes('paused');"));
    assert(await page.eval(clickRowButton(agentA, "Resume")), "resume click failed");
    await page.waitFor(rowScript(agentA, "return !row.textContent.includes('paused');"));

    assert(await page.eval(clickRowButton(agentA, "Rename")), "rename click failed");
    await page.waitFor(rowScript(agentA, "return Boolean(row.querySelector('input'));"));
    assert(
      await page.eval(rowScript(agentA, `
  const input = row.querySelector('input');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, 'Ada UI');
  input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'Ada UI' }));
  const save = [...row.querySelectorAll('button')].find((item) => item.title === 'Save name');
  if (!save) return false;
  save.click();
  return true;
`)),
      "rename save failed",
    );
    await page.waitFor("document.body.textContent.includes('Ada UI')");

    await page.eval("window.confirm = () => true");
    assert(await page.eval(clickRowButton(agentA, "Compact")), "compact click failed");
    await waitForCaptureContains(ctx, agentA, ["/compact"]);
    await page.waitFor(rowScript(agentA, `
  const button = [...row.querySelectorAll('button')].find((item) => item.title === 'Clear');
  return Boolean(button && !button.disabled);
`));
    assert(await page.eval(clickRowButton(agentA, "Clear")), "clear click failed");
    await waitForCaptureContains(ctx, agentA, ["/compact", "/clear"]);

    assert(await page.eval(clickRowButton(agentA, "Open terminal")), "terminal click failed");
    await page.waitFor("Boolean(document.querySelector('[data-modal=\"terminal\"]'))");
    assert(
      await page.eval("document.querySelector('[data-modal=\"terminal\"]')?.textContent.includes('fmark-project')"),
      "terminal overlay missing tmux session",
    );
    await page.eval("document.querySelector('[data-modal=\"terminal\"] .modal-close')?.click()");
    await page.waitFor("!document.querySelector('[data-modal=\"terminal\"]')");

    await run("tmux", ["kill-session", "-t", spawnedB.tmux_session], {
      cwd: ctx.project,
      env: ctx.env,
    });
    assert(await page.eval(clickRowButton(agentB, "Refresh")), "refresh click failed");
    await page.waitFor(rowScript(agentB, "return row.textContent.includes('detached');"));
    assert(await page.eval(clickRowButton(agentB, "Reconnect")), "reconnect click failed");
    await page.waitFor(rowScript(agentB, "return row.textContent.includes('connected');"), 15_000);
    await waitForCaptureContains(ctx, agentB, ["# F-Mark wake packet"]);

    assert(await page.eval(clickRowButton(agentA, "Goodbye")), "goodbye click failed");
    await page.waitFor(rowScript(agentA, "return row.textContent.includes('offline');"));

    pass("browser Agents tab controls", {
      sessionId,
      agents: [agentA, agentB],
      tmuxSessions: [spawnedA.tmux_session, spawnedB.tmux_session],
    });

    await writeFile(join(artifactRoot, "report.json"), JSON.stringify(report, null, 2));
    console.log(`HOT_TEST_REPORT ${join(artifactRoot, "report.json")}`);
    console.log(JSON.stringify({ run: RUN, artifactRoot, passes: report.checks.length }, null, 2));
  } catch (error) {
    if (artifactRoot === null) artifactRoot = await mkdtemp(join(tmpdir(), "fmark-mcp-phase14-hot-"));
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
      name: "Phase 14 Agents UI hot runner",
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
    if (artifactRoot !== null) {
      try {
        await run("tmux", ["kill-server"], {
          cwd: join(artifactRoot, "project"),
          env: { ...process.env, TMUX_TMPDIR: join(artifactRoot, "tmux") },
          timeoutMs: 5_000,
        });
      } catch {
        // isolated tmux server may already be gone
      }
    }
    if (artifactRoot !== null && process.env.FMARK_HOT_KEEP !== "1") {
      const reportPath = existsSync(join(artifactRoot, "report.json"))
        ? join(artifactRoot, "report.json")
        : join(artifactRoot, "report.failed.json");
      const debugPath = join(artifactRoot, "page-debug.json");
      const saved = existsSync(reportPath) ? await readFile(reportPath, "utf8") : null;
      const debug = existsSync(debugPath) ? await readFile(debugPath, "utf8") : null;
      for (const entry of await readdir(artifactRoot)) {
        if (entry === "report.json" || entry === "report.failed.json" || entry === "page-debug.json") continue;
        await rm(join(artifactRoot, entry), { recursive: true, force: true });
      }
      if (saved !== null) await writeFile(reportPath, saved);
      if (debug !== null) await writeFile(debugPath, debug);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
