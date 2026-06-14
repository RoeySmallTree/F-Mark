#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const WORKSPACE = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const DIST_INDEX = join(WORKSPACE, "packages/kernel/dist/index.js");
const RENDERER_INDEX = join(WORKSPACE, "packages/renderer/dist/index.html");
const CHROME = "/usr/bin/google-chrome";
const RUN = `phase20-${Date.now().toString(36)}`;
const TOKEN = `${RUN}-token`;

if (process.env.FMARK_HOT !== "1") {
  console.error("Set FMARK_HOT=1 to run Phase 20 sub-agent UI hot checks.");
  process.exit(1);
}

const report = { run: RUN, artifactRoot: null, checks: [] };

function pass(name, detail = {}) {
  report.checks.push({ name, status: "PASS", ...detail });
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
      return logs.join("").replaceAll(TOKEN, "<redacted-token>").slice(-6000);
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

async function startChrome(profile, debugPort, env) {
  const child = spawn(
    CHROME,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { env, stdio: ["ignore", "pipe", "pipe"] },
  );
  const started = Date.now();
  while (Date.now() - started < 15_000) {
    try {
      const res = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      if (res.ok) {
        const list = await res.json();
        const page = list.find((entry) => entry.type === "page");
        if (page?.webSocketDebuggerUrl) {
          return {
            wsUrl: page.webSocketDebuggerUrl,
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
      }
    } catch {
      // keep polling
    }
    await sleep(150);
  }
  child.kill("SIGKILL");
  throw new Error("Chrome debugging endpoint timed out");
}

class CdpPage {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.ready = new Promise((resolvePromise, reject) => {
      this.ws.once("open", resolvePromise);
      this.ws.once("error", reject);
    });
    this.ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { resolvePromise, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolvePromise(msg.result);
      }
    });
  }
  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolvePromise, reject });
    });
  }
  async eval(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails !== undefined) {
      throw new Error(result.exceptionDetails.text ?? "Runtime.evaluate failed");
    }
    return result.result.value;
  }
  async waitFor(expression, timeoutMs = 20_000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (await this.eval(expression)) return;
      await sleep(100);
    }
    throw new Error(`Timed out waiting for ${expression}`);
  }
  close() {
    this.ws.close();
  }
}

async function makeContext(artifactRoot) {
  const project = join(artifactRoot, "project");
  const home = join(artifactRoot, "home");
  const xdg = join(artifactRoot, "xdg");
  const chromeProfile = join(artifactRoot, "chrome");
  await mkdir(project, { recursive: true });
  await mkdir(home, { recursive: true });
  await mkdir(xdg, { recursive: true });
  await mkdir(chromeProfile, { recursive: true });
  return {
    project,
    chromeProfile,
    env: {
      ...process.env,
      HOME: home,
      XDG_CONFIG_HOME: xdg,
      NO_COLOR: "1",
    },
  };
}

async function registerAgent(port, participantId) {
  await api(port, "POST", "/participants/register", {
    kind: "agent",
    name: "Phase20 UI Agent",
    suggested_id: participantId,
    runtime_id: "claude",
  });
}

function subagentRun(participantId, input) {
  return {
    participant_id: participantId,
    schema: "fmark.subagent-run.v1",
    parent_participant_id: participantId,
    parent_runtime_id: input.runtimeId,
    parent_runtime_session_id: `${input.runtimeId}-session`,
    parent_turn_id: `${input.runtimeId}-turn`,
    parent_tool_use_id: input.toolUseId,
    subagent_id: input.subagentId,
    name: input.name,
    prompt_preview: input.prompt,
    status: input.status,
    started_at: new Date().toISOString(),
    ended_at: new Date().toISOString(),
    correlation_id: input.correlationId,
    sequence: 0,
    source: input.source,
    source_confidence: input.confidence,
  };
}

function subagentOutput(participantId, input) {
  return {
    participant_id: participantId,
    schema: "fmark.subagent-output.v1",
    parent_participant_id: participantId,
    parent_runtime_id: input.runtimeId,
    parent_runtime_session_id: `${input.runtimeId}-session`,
    parent_turn_id: `${input.runtimeId}-turn`,
    parent_tool_use_id: input.toolUseId,
    subagent_id: input.subagentId,
    name: input.name,
    content: input.content,
    arbitrary: false,
    status: input.status,
    correlation_id: input.correlationId,
    sequence: 1,
    source: input.source,
    source_confidence: input.confidence,
  };
}

async function seedFixtureEvents(port, sessionId) {
  const participantId = "ag-phase20";
  await registerAgent(port, participantId);
  const completed = {
    runtimeId: "claude",
    toolUseId: "tool-completed",
    subagentId: "child-completed",
    name: "reviewer",
    prompt: "Return PHASE20_COMPLETED_SUBAGENT.",
    content: "PHASE20_COMPLETED_SUBAGENT",
    status: "completed",
    correlationId: "corr-completed",
    source: "hook",
    confidence: "high",
  };
  const failed = {
    runtimeId: "gemini",
    toolUseId: "tool-failed",
    subagentId: "child-failed",
    name: "generalist",
    prompt: "Return PHASE20_FAILED_SUBAGENT.",
    content: "PHASE20_FAILED_SUBAGENT",
    status: "failed",
    correlationId: "corr-failed",
    source: "hook",
    confidence: "high",
  };
  await api(port, "POST", `/sessions/${sessionId}/events/subagent-run`, subagentRun(participantId, completed));
  await api(port, "POST", `/sessions/${sessionId}/events/subagent-output`, subagentOutput(participantId, completed));
  await api(port, "POST", `/sessions/${sessionId}/events/prose`, {
    participant_id: participantId,
    content: "Parent final after completed child.",
    arbitrary: false,
  });
  await api(port, "POST", `/sessions/${sessionId}/events/subagent-run`, subagentRun(participantId, failed));
  await api(port, "POST", `/sessions/${sessionId}/events/subagent-output`, subagentOutput(participantId, failed));
  await api(port, "POST", `/sessions/${sessionId}/events/turn-end`, {
    participant_id: participantId,
  });
}

async function navigate(page, port) {
  await page.send("Page.navigate", {
    url: `http://127.0.0.1:${port}/?token=${encodeURIComponent(TOKEN)}`,
  });
  await page.waitFor("Boolean(document.querySelector('.compose-box textarea'))");
}

async function verifyFixtureUi(page) {
  await page.waitFor("document.querySelectorAll('.arbitrary-group').length >= 2");
  const groupSummary = await page.eval(`(() => [...document.querySelectorAll('.arbitrary-group')]
    .map((group) => ({
      className: group.className,
      title: group.querySelector('.arbitrary-group-title')?.textContent ?? '',
      hasBody: Boolean(group.querySelector('.arbitrary-group-body'))
    })))()`);
  assert(
    groupSummary.some((group) => group.className.includes("arbitrary-group--concluded") && group.title.includes("1 sub-agent") && !group.hasBody),
    `completed sub-agent group was not collapsed with count: ${JSON.stringify(groupSummary)}`,
  );
  assert(
    groupSummary.some((group) => group.className.includes("arbitrary-group--ended") && group.hasBody),
    `failed sub-agent group was not kept open: ${JSON.stringify(groupSummary)}`,
  );
  const failedOpen = await page.eval(`document.querySelector('.subagent-box.error .subagent-box-head')?.getAttribute('aria-expanded')`);
  assert(failedOpen === "true", `failed sub-agent box was not open: ${failedOpen}`);
  await page.eval(`document.querySelector('.arbitrary-group--concluded .arbitrary-group-head')?.click()`);
  await page.waitFor("Boolean(document.querySelector('.arbitrary-group--concluded .subagent-box'))");
  const completedOpen = await page.eval(`document.querySelector('.arbitrary-group--concluded .subagent-box-head')?.getAttribute('aria-expanded')`);
  assert(completedOpen === "false", `completed sub-agent box was not collapsed: ${completedOpen}`);
  await page.eval(`document.querySelector('.arbitrary-group--concluded .subagent-box-head')?.click()`);
  await page.waitFor("document.body.textContent.includes('PHASE20_COMPLETED_SUBAGENT')");
  await page.eval(`[...document.querySelectorAll('.view-toggle button')]
    .find((button) => button.textContent?.includes('Conversation'))?.click()`);
  await page.waitFor("document.querySelectorAll('.arbitrary-group').length >= 2");
  const conversationText = await page.eval("document.body.textContent");
  assert(
    conversationText.includes("PHASE20_FAILED_SUBAGENT"),
    "conversation view did not keep sub-agent output visible",
  );
  pass("fixture sub-agent UI groups, collapses, and conversation view renders", {
    groupCount: groupSummary.length,
  });
}

async function verifyRealProjectUi(page, port, realProject) {
  await navigate(page, port);
  await page.waitFor("document.querySelectorAll('.arbitrary-group').length >= 2", 20_000);
  await page.eval(`[...document.querySelectorAll('.arbitrary-group-head')].forEach((button) => {
    const group = button.closest('.arbitrary-group');
    if (!group?.querySelector('.arbitrary-group-body')) button.click();
  })`);
  await page.waitFor("document.querySelectorAll('.subagent-box').length >= 3", 20_000);
  const realSummary = await page.eval(`(() => ({
    subagentBoxes: document.querySelectorAll('.subagent-box').length,
    text: document.body.textContent ?? '',
    statuses: [...document.querySelectorAll('.subagent-box')]
      .map((box) => box.getAttribute('data-status'))
  }))()`);
  for (const marker of [
    "CLAUDE_REAL_SUBAGENT",
    "CODEX_REAL_SUBAGENT",
    "GEMINI_REAL_SUBAGENT",
  ]) {
    assert(realSummary.text.includes(marker), `real project UI missing ${marker}`);
  }
  pass("real vendor sub-agent events render as nested boxes", {
    realProject,
    subagentBoxes: realSummary.subagentBoxes,
    statuses: realSummary.statuses,
  });
}

async function main() {
  let artifactRoot = null;
  let fixtureKernel = null;
  let realKernel = null;
  let chrome = null;
  let page = null;
  try {
    assert(existsSync(DIST_INDEX), "kernel dist is missing; run pnpm -F f-mark build");
    assert(existsSync(RENDERER_INDEX), "renderer dist is missing; run pnpm -F @f-mark/renderer build");
    assert(existsSync(CHROME), `Chrome is missing at ${CHROME}`);
    artifactRoot = await mkdtemp(join(tmpdir(), "fmark-mcp-phase20-ui-hot-"));
    report.artifactRoot = artifactRoot;
    const ctx = await makeContext(artifactRoot);
    const port = await freePort();
    const debugPort = await freePort();
    fixtureKernel = await startKernel(ctx.project, port, ctx.env);
    const session = await api(port, "POST", "/sessions", {
      slug: `${RUN}-subagent-ui`,
      path: ctx.project,
    });
    await seedFixtureEvents(port, session.id);

    chrome = await startChrome(ctx.chromeProfile, debugPort, ctx.env);
    page = new CdpPage(chrome.wsUrl);
    await navigate(page, port);
    await verifyFixtureUi(page);

    const realProject = process.env.FMARK_PHASE20_REAL_PROJECT;
    if (typeof realProject === "string" && realProject.length > 0) {
      const realPort = await freePort();
      realKernel = await startKernel(realProject, realPort, ctx.env);
      await verifyRealProjectUi(page, realPort, realProject);
    }

    const reportPath = join(artifactRoot, "report.json");
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`HOT_TEST_REPORT ${reportPath}`);
  } catch (err) {
    report.error = err instanceof Error ? err.message : String(err);
    if (fixtureKernel !== null) report.fixtureKernelLogs = fixtureKernel.logs();
    if (realKernel !== null) report.realKernelLogs = realKernel.logs();
    if (page !== null) {
      try {
        report.pageText = await page.eval("document.body?.innerText?.slice(0, 4000) ?? ''");
      } catch {
        // best-effort diagnostics only
      }
    }
    if (artifactRoot !== null) {
      const failedPath = join(artifactRoot, "report.failed.json");
      await writeFile(failedPath, JSON.stringify(report, null, 2));
      console.error(`HOT_TEST_FAILED ${failedPath}`);
    }
    throw err;
  } finally {
    page?.close();
    if (chrome !== null) await chrome.stop();
    if (fixtureKernel !== null) await fixtureKernel.stop();
    if (realKernel !== null) await realKernel.stop();
    if (artifactRoot !== null && process.env.FMARK_KEEP_HOT_ARTIFACTS !== "1") {
      for (const entry of await readdir(artifactRoot)) {
        if (entry === "report.json" || entry === "report.failed.json") continue;
        await rm(join(artifactRoot, entry), { recursive: true, force: true });
      }
    }
  }
}

main().catch((err) => {
  console.error(err?.stack ?? err);
  process.exit(1);
});
