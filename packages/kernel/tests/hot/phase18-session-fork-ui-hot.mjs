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
const RUN = `phase18-${Date.now().toString(36)}`;
const TOKEN = `${RUN}-token`;

if (process.env.FMARK_HOT !== "1") {
  console.error("Set FMARK_HOT=1 to run Phase 18 session fork UI hot checks.");
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
        maxBuffer: 1024 * 1024 * 3,
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
      'cat >> "$FMARK_CAPTURE_DIR/${F_MARK_AGENT_ID:-unknown}.txt"',
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

async function upsertCaptureRuntime(port, ctx) {
  await api(port, "PUT", "/runtimes/capture", {
    displayName: "Capture Runtime",
    executable: ctx.captureRuntime,
    args: [],
    env: { FMARK_CAPTURE_DIR: ctx.captureDir },
    readyDelayMs: 0,
  });
}

async function spawnCaptureAgent(port, sessionId, participantId, name) {
  return api(port, "POST", "/managed-agents/spawn", {
    runtime_id: "capture",
    session_id: sessionId,
    suggested_participant_id: participantId,
    name,
  });
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
      throw new Error(
        result.exceptionDetails.exception?.description ??
          result.exceptionDetails.text ??
          "Runtime.evaluate failed",
      );
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

function activeSessionSlugScript() {
  return `
(() => document.querySelector('.session-item.active .slug')?.textContent?.trim() ?? null)()
`;
}

function clickForkForSlugScript(slug) {
  return `
(() => {
  const rows = [...document.querySelectorAll('.session-item')];
  const row = rows.find((item) => item.querySelector('.slug')?.textContent?.trim() === ${JSON.stringify(slug)});
  if (!row) return false;
  const button = row.querySelector('.session-row-action');
  if (!button) return false;
  button.click();
  return true;
})()
`;
}

function submitForkScript(name) {
  return `
(() => {
  const form = document.querySelector('.fork-session-form');
  const input = document.querySelector('#fork-session-name');
  if (!form || !input) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, ${JSON.stringify(name)});
  input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(name)} }));
  form.requestSubmit();
  return true;
})()
`;
}

function setComposeTextScript(text) {
  return `
(() => {
  const textarea = document.querySelector('.compose-box textarea');
  if (!textarea) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  setter.call(textarea, ${JSON.stringify(text)});
  textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(text)} }));
  return true;
})()
`;
}

function clickComposeForkScript() {
  return `
(() => {
  const button = document.querySelector('.compose-actions-secondary button[title="Fork session"]');
  if (!button || button.disabled) return false;
  button.click();
  return true;
})()
`;
}

async function sessionBySlug(port, slug) {
  const body = await api(port, "GET", "/sessions?scope=all");
  const found = (body.sessions ?? []).find((session) => session.slug === slug);
  assert(found !== undefined, `session slug not found: ${slug}`);
  return found;
}

async function main() {
  let artifactRoot = null;
  let kernel = null;
  let chrome = null;
  let page = null;
  try {
    assert(existsSync(RENDERER_INDEX), "renderer dist is missing; run pnpm -F @f-mark/renderer build");
    artifactRoot = await mkdtemp(join(tmpdir(), "fmark-mcp-phase18-ui-hot-"));
    report.artifactRoot = artifactRoot;
    const ctx = await makeContext(artifactRoot);
    const port = 10_600 + Math.floor(Math.random() * 300);
    const debugPort = 10_950 + Math.floor(Math.random() * 300);
    kernel = await startKernel(ctx.project, port, ctx.env);
    await upsertCaptureRuntime(port, ctx);

    const sourceSlug = `${RUN}-source`;
    const otherSlug = `${RUN}-other`;
    const rowForkSlug = `${RUN}-row-fork`;
    const composerForkSlug = `${RUN}-composer-fork`;
    const source = await api(port, "POST", "/sessions", { slug: sourceSlug });
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
    await api(port, "POST", "/sessions", { slug: otherSlug });
    const participants = await api(port, "GET", "/participants");
    const userId = Object.entries(participants.participants ?? {}).find(([, p]) => p.kind === "user")?.[0];
    assert(typeof userId === "string", "default user not found");
    const sourceMarker = `FMARK_${RUN}_SOURCE_COPY`;
    await api(port, "POST", `/sessions/${encodeURIComponent(source.id)}/events/prose`, {
      participant_id: userId,
      content: sourceMarker,
      name: "Phase 18 Source",
    });

    const liveId = "ag-p18-live";
    const pausedId = "ag-p18-pause";
    const deadId = "ag-p18-dead";
    const live = await spawnCaptureAgent(port, source.id, liveId, "Phase 18 Live");
    const paused = await spawnCaptureAgent(port, source.id, pausedId, "Phase 18 Paused");
    const dead = await spawnCaptureAgent(port, source.id, deadId, "Phase 18 Detached");
    await waitForCaptureContains(ctx, liveId, ["# F-Mark agent onboarding", source.id]);
    await waitForCaptureContains(ctx, pausedId, ["# F-Mark agent onboarding", source.id]);
    await waitForCaptureContains(ctx, deadId, ["# F-Mark agent onboarding", source.id]);
    await api(port, "POST", `/managed-agents/${encodeURIComponent(pausedId)}/pause`);
    await run("tmux", ["kill-session", "-t", dead.tmux_session], {
      cwd: ctx.project,
      env: ctx.env,
    });

    chrome = await startChrome(ctx, debugPort);
    page = new CdpPage(chrome.wsUrl);
    await page.open();
    await page.send("Page.navigate", {
      url: `http://127.0.0.1:${port}/?token=${encodeURIComponent(TOKEN)}`,
    });
    await page.waitFor(`document.body.textContent.includes(${JSON.stringify(sourceSlug)})`, 20_000);
    await page.waitFor(`document.body.textContent.includes(${JSON.stringify(otherSlug)})`, 20_000);
    await page.waitFor("Boolean(document.querySelector('.compose-box textarea'))");
    await page.waitFor(`${activeSessionSlugScript()} === ${JSON.stringify(otherSlug)}`);

    assert(await page.eval(clickForkForSlugScript(sourceSlug)), "session row fork click failed");
    await page.waitFor("Boolean(document.querySelector('.fork-session-form'))");
    const activeWhilePopoverOpen = await page.eval(activeSessionSlugScript());
    assert(activeWhilePopoverOpen === otherSlug, "row fork button selected the source session");
    assert(await page.eval(submitForkScript(rowForkSlug)), "row fork submit failed");
    await page.waitFor(`${activeSessionSlugScript()} === ${JSON.stringify(rowForkSlug)}`, 15_000);
    await page.waitFor(`document.body.textContent.includes('Phase 18 Detached: detached')`, 10_000);
    const rowFork = await sessionBySlug(port, rowForkSlug);
    await waitForCaptureContains(ctx, liveId, ["F-Mark fork handoff", source.id, rowFork.id]);
    const afterRowParticipants = await api(port, "GET", "/participants");
    assert(
      afterRowParticipants.participants?.[liveId]?.active_session === rowFork.id,
      "row fork did not rebind live agent",
    );
    assert(
      afterRowParticipants.participants?.[pausedId]?.active_session === source.id,
      "row fork moved paused agent",
    );
    assert(
      afterRowParticipants.participants?.[deadId]?.active_session === source.id,
      "row fork moved detached agent",
    );
    const forkEvents = await api(port, "GET", `/sessions/${encodeURIComponent(rowFork.id)}/events`);
    assert(JSON.stringify(forkEvents).includes(sourceMarker), "row fork did not copy source event");
    await page.waitFor(`
(() => [...document.querySelectorAll('.agent-chip')]
  .some((chip) => chip.getAttribute('data-participant-id') === ${JSON.stringify(liveId)}))()
`, 10_000);
    pass("browser session-row fork preserves row selection and shows handoff warnings", {
      sourceSessionId: source.id,
      forkSessionId: rowFork.id,
      liveAgent: liveId,
      pausedAgent: pausedId,
      detachedAgent: deadId,
    });

    await page.eval("document.querySelector('.fork-session-actions .btn-ghost')?.click()");
    await page.waitFor("!document.querySelector('.fork-session-form')");
    const draft = `FMARK_${RUN}_DRAFT_SURVIVES`;
    assert(await page.eval(setComposeTextScript(draft)), "compose draft set failed");
    assert(await page.eval(clickComposeForkScript()), "compose fork click failed");
    await page.waitFor("Boolean(document.querySelector('.fork-session-form'))");
    assert(await page.eval(submitForkScript(composerForkSlug)), "compose fork submit failed");
    await page.waitFor(`${activeSessionSlugScript()} === ${JSON.stringify(composerForkSlug)}`, 15_000);
    await page.waitFor("!document.querySelector('.fork-session-form')", 10_000);
    const draftAfter = await page.eval("document.querySelector('.compose-box textarea')?.value ?? ''");
    assert(draftAfter === draft, "compose draft was not preserved after fork");
    const composerFork = await sessionBySlug(port, composerForkSlug);
    const afterComposerParticipants = await api(port, "GET", "/participants");
    assert(
      afterComposerParticipants.participants?.[liveId]?.active_session === composerFork.id,
      "composer fork did not rebind live agent",
    );
    await waitForCaptureContains(ctx, liveId, ["F-Mark fork handoff", rowFork.id, composerFork.id]);
    pass("browser composer fork switches to fork and preserves draft", {
      previousSessionId: rowFork.id,
      forkSessionId: composerFork.id,
      draft,
    });

    await writeFile(join(artifactRoot, "report.json"), JSON.stringify(report, null, 2));
    console.log(`HOT_TEST_REPORT ${join(artifactRoot, "report.json")}`);
    console.log(JSON.stringify({ run: RUN, artifactRoot, passes: report.checks.length }, null, 2));
  } catch (error) {
    report.checks.push({
      name: "Phase 18 session fork UI hot runner",
      status: "FAIL",
      error: error instanceof Error ? error.message : String(error),
    });
    if (page !== null) {
      try {
        const debug = await page.eval(`JSON.stringify({
          text: document.body.textContent?.slice(0, 3000),
          active: document.querySelector('.session-item.active .slug')?.textContent,
          forkOpen: Boolean(document.querySelector('.fork-session-form')),
          html: document.body.innerHTML.slice(0, 3000)
        })`);
        report.debug = JSON.parse(debug);
      } catch {
        // ignore debug failures
      }
    }
    if (artifactRoot !== null) {
      await writeFile(join(artifactRoot, "report.failed.json"), JSON.stringify(report, null, 2));
      console.error(`HOT_TEST_FAILED_REPORT ${join(artifactRoot, "report.failed.json")}`);
    }
    throw error;
  } finally {
    if (page !== null) page.close();
    if (chrome !== null) {
      chrome.child.kill("SIGTERM");
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
        // The isolated tmux server may already be gone.
      }
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
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
