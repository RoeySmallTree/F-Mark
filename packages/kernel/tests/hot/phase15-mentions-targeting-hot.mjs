#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import {
  chmod,
  copyFile,
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
const RUN = `phase15-${Date.now().toString(36)}`;
const TOKEN = `${RUN}-token`;
const LAUNCH_MARKER = "<!-- fmark:launch-prompt:v1 -->";

if (process.env.FMARK_HOT !== "1") {
  console.error("Set FMARK_HOT=1 to run Phase 15 mention/targeting hot checks.");
  process.exit(1);
}

const report = { run: RUN, artifactRoot: null, checks: [] };

function pass(name, detail = {}) {
  report.checks.push({ name, status: "PASS", ...detail });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function redact(text) {
  return text.replaceAll(TOKEN, "<redacted-token>");
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = execFile(
      command,
      args,
      {
        cwd: options.cwd,
        env: options.env,
        timeout: options.timeoutMs ?? 30_000,
        maxBuffer: 1024 * 1024 * 4,
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

async function createSession(port, project) {
  const session = await api(port, "POST", "/sessions", {
    slug: `${RUN}-mentions`,
    path: project,
  });
  return session.id;
}

async function activatePath(port, project) {
  await api(port, "POST", "/paths/active", { path: project });
}

async function defaultUserId(port) {
  const roster = await api(port, "GET", "/participants");
  const found = Object.entries(roster.participants ?? {}).find(
    ([, participant]) => participant.kind === "user",
  );
  assert(found !== undefined, "default user participant not found");
  return found[0];
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

async function spawnCaptureAgent(port, runtimeId, sessionId, participantId, name) {
  return api(port, "POST", "/managed-agents/spawn", {
    runtime_id: runtimeId,
    session_id: sessionId,
    suggested_participant_id: participantId,
    name,
  });
}

async function captureText(ctx, participantId) {
  try {
    return await readFile(join(ctx.captureDir, `${participantId}.txt`), "utf8");
  } catch {
    return "";
  }
}

async function waitForCaptureContains(ctx, participantId, needles, timeoutMs = 15_000) {
  const capturePath = join(ctx.captureDir, `${participantId}.txt`);
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const text = await captureText(ctx, participantId);
    if (needles.every((needle) => text.includes(needle))) return text;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`timed out waiting for ${capturePath} to contain ${needles.join(", ")}`);
}

function occurrenceCount(text, needle) {
  return text.split(needle).length - 1;
}

async function wakeCount(ctx, participantId) {
  return occurrenceCount(await captureText(ctx, participantId), "# F-Mark wake packet");
}

async function waitForWakeCount(ctx, participantId, minimum, timeoutMs = 15_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const count = await wakeCount(ctx, participantId);
    if (count >= minimum) return count;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`timed out waiting for ${participantId} wake count >= ${minimum}`);
}

async function assertWakeCountStable(ctx, participantId, expected, timeoutMs = 1_500) {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, timeoutMs));
  const actual = await wakeCount(ctx, participantId);
  assert(
    actual === expected,
    `${participantId} wake count changed: expected ${expected}, got ${actual}`,
  );
}

async function eventWithContent(port, sessionId, marker) {
  const body = await api(port, "GET", `/sessions/${encodeURIComponent(sessionId)}/events`);
  const events = body.events ?? body;
  const found = events.find((event) => JSON.stringify(event.payload).includes(marker));
  assert(found !== undefined, `event marker ${marker} not found`);
  return found;
}

async function waitForSessionMarker(port, sessionId, marker, timeoutMs = 45_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const body = await api(port, "GET", `/sessions/${encodeURIComponent(sessionId)}/events`);
    if (JSON.stringify(body).includes(marker)) return body;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw new Error(`timed out waiting for marker ${marker} in session ${sessionId}`);
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
    this.lastException = null;
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
      if (msg.method === "Runtime.exceptionThrown") {
        this.lastException =
          msg.params?.exceptionDetails?.exception?.description ??
          msg.params?.exceptionDetails?.text ??
          JSON.stringify(msg.params ?? {});
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
      const detail =
        result.exceptionDetails.exception?.description ??
        result.exceptionDetails.text ??
        this.lastException ??
        "Runtime.evaluate failed";
      throw new Error(detail);
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

async function setValue(page, selector, value) {
  assert(
    await page.eval(`
(() => {
  const input = document.querySelector(${JSON.stringify(selector)});
  if (!input) return false;
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(input, ${JSON.stringify(value)});
  input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(value)} }));
  return true;
})()
`),
    `failed to set ${selector}`,
  );
}

async function clickComposeMention(page) {
  assert(
    await page.eval(`
(() => {
  const button = [...document.querySelectorAll('.compose-actions-secondary button')]
    .find((item) => item.title === 'Mention agent');
  if (!button) return false;
  button.click();
  return true;
})()
`),
    "compose mention button not found",
  );
}

async function clickMentionChoice(page, participantId) {
  await page.waitFor(`document.body.textContent.includes(${JSON.stringify(participantId)})`);
  assert(
    await page.eval(`
(() => {
  const rows = [...document.querySelectorAll('.agent-mention-row')];
  const row = rows.find((item) => item.textContent && item.textContent.includes(${JSON.stringify(participantId)}));
  if (!row) return false;
  const choice = row.querySelector('.agent-mention-choice');
  if (!choice || choice.disabled) return false;
  choice.click();
  return true;
})()
`),
    `mention choice ${participantId} not selectable`,
  );
}

async function clickMentionAction(page, participantId, label) {
  await page.waitFor(`document.body.textContent.includes(${JSON.stringify(participantId)})`);
  assert(
    await page.eval(`
(() => {
  const rows = [...document.querySelectorAll('.agent-mention-row')];
  const row = rows.find((item) => item.textContent && item.textContent.includes(${JSON.stringify(participantId)}));
  if (!row) return false;
  const button = [...row.querySelectorAll('button')].find((item) => item.textContent && item.textContent.includes(${JSON.stringify(label)}));
  if (!button || button.disabled) return false;
  button.click();
  return true;
})()
`),
    `mention action ${label} for ${participantId} not available`,
  );
}

async function sendCompose(page, value) {
  await setValue(page, ".compose-box textarea", value);
  assert(
    await page.eval(`
(() => {
  const button = document.querySelector('.primary-action');
  if (!button || button.disabled) return false;
  button.click();
  return true;
})()
`),
    "compose send failed",
  );
}

async function sendComposeMention(page, marker, participantId) {
  await setValue(page, ".compose-box textarea", `${marker} `);
  await clickComposeMention(page);
  await clickMentionChoice(page, participantId);
  assert(
    await page.eval(`
(() => {
  const button = document.querySelector('.primary-action');
  if (!button || button.disabled) return false;
  button.click();
  return true;
})()
`),
    "compose mention send failed",
  );
}

async function openLineCommentDraft(page, marker) {
  await page.waitFor(`document.body.textContent.includes(${JSON.stringify(marker)})`, 10_000);
  assert(
    await page.eval(`
(() => {
  const roots = [...document.querySelectorAll('.commentable-content')];
  const root = roots.find((item) => item.textContent && item.textContent.includes(${JSON.stringify(marker)}));
  if (!root) return false;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNode = walker.nextNode();
  if (!textNode || textNode.textContent.length === 0) return false;
  const range = document.createRange();
  range.setStart(textNode, 0);
  range.setEnd(textNode, Math.min(8, textNode.textContent.length));
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  const rect = root.getBoundingClientRect();
  root.dispatchEvent(new MouseEvent('mouseup', {
    bubbles: true,
    clientX: rect.left + 12,
    clientY: rect.top + 12,
  }));
  return true;
})()
`),
    "failed to select line comment target",
  );
  await page.waitFor("Boolean(document.querySelector('.line-comment-marker.draft'))");
  assert(
    await page.eval(`
(() => {
  const marker = document.querySelector('.line-comment-marker.draft');
  if (!marker) return false;
  marker.click();
  return true;
})()
`),
    "failed to open line comment draft",
  );
  await page.waitFor("Boolean(document.querySelector('.line-comment-popover textarea'))");
}

async function submitLineCommentWithMention(page, text, participantId) {
  await setValue(page, ".line-comment-popover textarea", `${text} `);
  assert(
    await page.eval(`
(() => {
  const button = document.querySelector('.line-comment-mention');
  if (!button || button.disabled) return false;
  button.click();
  return true;
})()
`),
    "line comment mention button failed",
  );
  await clickMentionChoice(page, participantId);
  assert(
    await page.eval(`
(() => {
  const buttons = [...document.querySelectorAll('.line-comment-popover-actions button')];
  const button = buttons.find((item) => item.textContent && item.textContent.includes('Comment'));
  if (!button || button.disabled) return false;
  button.click();
  return true;
})()
`),
    "line comment submit failed",
  );
}

async function submitRightReplyWithMention(page, text, participantId) {
  await page.waitFor("Boolean(document.querySelector('.right-comment-replybox input'))");
  await setValue(page, ".right-comment-replybox input", `${text} `);
  assert(
    await page.eval(`
(() => {
  const button = document.querySelector('.right-comment-replybox button[title="Mention agent"]');
  if (!button || button.disabled) return false;
  button.click();
  return true;
})()
`),
    "right reply mention button failed",
  );
  await clickMentionChoice(page, participantId);
  assert(
    await page.eval(`
(() => {
  const buttons = [...document.querySelectorAll('.right-comment-replybox button')];
  const send = buttons.find((item) => item.getAttribute('aria-label') === 'Send reply');
  if (!send || send.disabled) return false;
  send.click();
  return true;
})()
`),
    "right reply submit failed",
  );
}

async function createTodoAssignedTo(page, title, participantId) {
  assert(
    await page.eval(`
(() => {
  const button = [...document.querySelectorAll('.compose-actions-secondary button')]
    .find((item) => item.title === 'Create Todo');
  if (!button) return false;
  button.click();
  return true;
})()
`),
    "create todo button not found",
  );
  await page.waitFor("Boolean(document.querySelector('.create-todo-form'))");
  await setValue(page, "#create-todo-title", title);
  assert(
    await page.eval(`
(() => {
  const select = document.querySelector('#create-todo-assignee');
  if (!select) return false;
  select.value = ${JSON.stringify(participantId)};
  select.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()
`),
    "todo assignee selection failed",
  );
  assert(
    await page.eval(`
(() => {
  const button = document.querySelector('.create-todo-actions button[type="submit"]');
  if (!button || button.disabled) return false;
  button.click();
  return true;
})()
`),
    "todo submit failed",
  );
}

async function copyIfExists(from, to) {
  if (!existsSync(from)) return false;
  await mkdir(join(to, ".."), { recursive: true });
  await copyFile(from, to);
  return true;
}

async function prepareCodexHome(ctx) {
  await mkdir(ctx.codexHome, { recursive: true });
  await copyIfExists(join(process.env.HOME, ".codex/auth.json"), join(ctx.codexHome, "auth.json"));
  await copyIfExists(join(process.env.HOME, ".codex/installation_id"), join(ctx.codexHome, "installation_id"));
}

async function prepareGeminiHome(ctx) {
  const geminiHome = join(ctx.home, ".gemini");
  await mkdir(geminiHome, { recursive: true });
  for (const file of ["settings.json", "oauth_creds.json", "google_accounts.json", "installation_id"]) {
    await copyIfExists(join(process.env.HOME, ".gemini", file), join(geminiHome, file));
  }
  await writeFile(
    join(geminiHome, "trustedFolders.json"),
    JSON.stringify({ [ctx.project]: "TRUST_FOLDER" }, null, 2),
  );
}

async function registerLinkedAgent(port, sessionId, participantId, runtimeId, name) {
  await api(port, "POST", "/participants/register", {
    kind: "agent",
    name,
    suggested_id: participantId,
  });
  await api(port, "POST", `/agents/${encodeURIComponent(participantId)}/link`, {
    session_id: sessionId,
  });
  return { participantId, sessionId, runtimeId };
}

async function writeClaudeMcpConfig(path, project, agent) {
  await writeFile(
    path,
    JSON.stringify(
      {
        mcpServers: {
          fmark: {
            type: "stdio",
            command: process.execPath,
            args: [DIST_INDEX, "mcp", "--path", project],
            env: {
              F_MARK_PATH: project,
              F_MARK_AGENT_ID: agent.participantId,
              F_MARK_SESSION_ID: agent.sessionId,
              F_MARK_RUNTIME_ID: agent.runtimeId,
            },
          },
        },
      },
      null,
      2,
    ),
  );
}

async function configureCodexMcp(project, env, agent) {
  await run(
    "codex",
    [
      "mcp",
      "add",
      "--env",
      `F_MARK_PATH=${project}`,
      "--env",
      `F_MARK_AGENT_ID=${agent.participantId}`,
      "--env",
      `F_MARK_SESSION_ID=${agent.sessionId}`,
      "--env",
      `F_MARK_RUNTIME_ID=${agent.runtimeId}`,
      "fmark",
      "--",
      process.execPath,
      DIST_INDEX,
      "mcp",
      "--path",
      project,
    ],
    { cwd: project, env, timeoutMs: 30_000 },
  );
}

async function configureGeminiMcp(project, env, agent) {
  await run(
    "gemini",
    [
      "mcp",
      "add",
      "--scope",
      "project",
      "--transport",
      "stdio",
      "--trust",
      "-e",
      `F_MARK_PATH=${project}`,
      "-e",
      `F_MARK_AGENT_ID=${agent.participantId}`,
      "-e",
      `F_MARK_SESSION_ID=${agent.sessionId}`,
      "-e",
      `F_MARK_RUNTIME_ID=${agent.runtimeId}`,
      "fmark",
      process.execPath,
      DIST_INDEX,
      "mcp",
      "--path",
      project,
    ],
    { cwd: project, env, timeoutMs: 30_000 },
  );
}

function vendorMentionPrompt(vendor, marker, ackMarker, participantId) {
  return [
    `You are hot-testing F-Mark mention metadata for ${vendor}.`,
    "Use MCP server fmark only. Do not use curl, shell, files, or REST.",
    "First call fmark_get_inbox with arguments exactly {}.",
    `Only if that inbox result contains ${marker} and mention participant_id ${participantId}, call fmark_post_prose with arguments exactly {"content":"${ackMarker}"}.`,
    "Then call fmark_end_turn with arguments exactly {}.",
    "After the MCP calls succeed, reply with exactly DONE.",
  ].join(" ");
}

async function postVendorMentionMarker(port, sessionId, userId, participantId, displayName, marker) {
  await api(port, "POST", `/sessions/${encodeURIComponent(sessionId)}/events/prose`, {
    participant_id: userId,
    content: marker,
    mentions: [
      {
        participant_id: participantId,
        display_name: displayName,
        token: `@${displayName}`,
      },
    ],
  });
}

async function assertVendorConsumedMention(port, sessionId, participantId, marker) {
  const inbox = await api(
    port,
    "GET",
    `/sessions/${encodeURIComponent(sessionId)}/inbox?participant_id=${encodeURIComponent(participantId)}`,
  );
  assert(
    !JSON.stringify(inbox.events ?? []).includes(marker),
    `${participantId} left mention marker unread after vendor run`,
  );
}

async function runClaudeMentionAgent(ctx, port, sessionId, userId) {
  const participantId = "ag-rclaude";
  const displayName = "Real Claude";
  const agent = await registerLinkedAgent(port, sessionId, participantId, "claude", displayName);
  const marker = `FMARK_${RUN}_CLAUDE_MENTION`;
  const ackMarker = `FMARK_${RUN}_CLAUDE_MENTION_ACK`;
  await postVendorMentionMarker(port, sessionId, userId, participantId, displayName, marker);
  const config = join(ctx.project, "claude-mcp-phase15.json");
  await writeClaudeMcpConfig(config, ctx.project, agent);
  const result = await run(
    "claude",
    [
      "--print",
      "--output-format",
      "text",
      "--no-session-persistence",
      "--mcp-config",
      config,
      "--strict-mcp-config",
      "--permission-mode",
      "bypassPermissions",
      "--allowedTools",
      "mcp__fmark__fmark_get_inbox,mcp__fmark__fmark_post_prose,mcp__fmark__fmark_end_turn",
      "--max-budget-usd",
      "1.00",
      vendorMentionPrompt("claude", marker, ackMarker, participantId),
    ],
    { cwd: ctx.project, env: { ...process.env, NO_COLOR: "1" }, timeoutMs: 180_000 },
  );
  await waitForSessionMarker(port, sessionId, ackMarker);
  await assertVendorConsumedMention(port, sessionId, participantId, marker);
  pass("Claude real model MCP mention metadata", {
    sessionId,
    participantId,
    stdout: redact(result.stdout).slice(-1200),
  });
}

async function runCodexMentionAgent(ctx, port, sessionId, userId) {
  await prepareCodexHome(ctx);
  const participantId = "ag-rcodex";
  const displayName = "Real Codex";
  const agent = await registerLinkedAgent(port, sessionId, participantId, "codex", displayName);
  const marker = `FMARK_${RUN}_CODEX_MENTION`;
  const ackMarker = `FMARK_${RUN}_CODEX_MENTION_ACK`;
  await postVendorMentionMarker(port, sessionId, userId, participantId, displayName, marker);
  await configureCodexMcp(ctx.project, ctx.env, agent);
  const result = await run(
    "codex",
    [
      "exec",
      "--json",
      "-C",
      ctx.project,
      "--skip-git-repo-check",
      "--dangerously-bypass-approvals-and-sandbox",
      vendorMentionPrompt("codex", marker, ackMarker, participantId),
    ],
    { cwd: ctx.project, env: ctx.env, timeoutMs: 240_000 },
  );
  await waitForSessionMarker(port, sessionId, ackMarker);
  await assertVendorConsumedMention(port, sessionId, participantId, marker);
  pass("Codex real model MCP mention metadata", {
    sessionId,
    participantId,
    stdout: redact(result.stdout).slice(-1200),
  });
}

async function runGeminiMentionAgent(ctx, port, sessionId, userId) {
  await prepareGeminiHome(ctx);
  const participantId = "ag-rgemini";
  const displayName = "Real Gemini";
  const agent = await registerLinkedAgent(port, sessionId, participantId, "gemini", displayName);
  const marker = `FMARK_${RUN}_GEMINI_MENTION`;
  const ackMarker = `FMARK_${RUN}_GEMINI_MENTION_ACK`;
  await postVendorMentionMarker(port, sessionId, userId, participantId, displayName, marker);
  await configureGeminiMcp(ctx.project, ctx.env, agent);
  const result = await run(
    "gemini",
    [
      "--skip-trust",
      "--approval-mode",
      "yolo",
      "--allowed-mcp-server-names",
      "fmark",
      "--output-format",
      "text",
      "--prompt",
      vendorMentionPrompt("gemini", marker, ackMarker, participantId),
    ],
    { cwd: ctx.project, env: ctx.env, timeoutMs: 240_000 },
  );
  await waitForSessionMarker(port, sessionId, ackMarker);
  await assertVendorConsumedMention(port, sessionId, participantId, marker);
  pass("Gemini real model MCP mention metadata", {
    sessionId,
    participantId,
    stdout: redact(result.stdout).slice(-1200),
  });
}

async function main() {
  let artifactRoot = null;
  let kernel = null;
  let chrome = null;
  let page = null;
  try {
    assert(existsSync(RENDERER_INDEX), "renderer dist is missing; run pnpm -F @f-mark/renderer build");
    artifactRoot = await mkdtemp(join(tmpdir(), "fmark-mcp-phase15-hot-"));
    report.artifactRoot = artifactRoot;
    const ctx = await makeContext(artifactRoot);
    const port = 11_500 + Math.floor(Math.random() * 300);
    const debugPort = 11_900 + Math.floor(Math.random() * 300);
    kernel = await startKernel(ctx.project, port, ctx.env);
    await activatePath(port, ctx.project);
    const sessionId = await createSession(port, ctx.project);
    const userId = await defaultUserId(port);
    const pathState = await api(port, "GET", "/paths");
    assert(pathState.activePath === ctx.project, "kernel did not keep the hot project active");
    const sessionList = await api(port, "GET", "/sessions");
    assert(
      (sessionList.sessions ?? []).some((session) => session.id === sessionId),
      "kernel session list did not include the hot session",
    );

    for (const runtimeId of ["claude", "codex", "gemini"]) {
      await upsertCaptureRuntime(port, ctx, runtimeId);
    }
    const claudeId = "ag-p15-claude";
    const codexId = "ag-p15-codex";
    const geminiId = "ag-p15-gemini";
    const spawnedClaude = await spawnCaptureAgent(port, "claude", sessionId, claudeId, "Ada Claude");
    const spawnedCodex = await spawnCaptureAgent(port, "codex", sessionId, codexId, "Ben Codex");
    const spawnedGemini = await spawnCaptureAgent(port, "gemini", sessionId, geminiId, "Gia Gemini");
    await waitForCaptureContains(ctx, claudeId, [
      LAUNCH_MARKER,
      "# F-Mark agent onboarding",
      sessionId,
      claudeId,
    ]);
    await waitForCaptureContains(ctx, codexId, [
      LAUNCH_MARKER,
      "# F-Mark agent onboarding",
      sessionId,
      codexId,
    ]);
    await waitForCaptureContains(ctx, geminiId, [
      LAUNCH_MARKER,
      "# F-Mark agent onboarding",
      sessionId,
      geminiId,
    ]);

    chrome = await startChrome(ctx, debugPort);
    page = new CdpPage(chrome.wsUrl);
    await page.open();
    await page.send("Page.navigate", {
      url: `http://127.0.0.1:${port}/?token=${encodeURIComponent(TOKEN)}`,
    });
    await page.waitFor(
      `document.body.textContent.includes(${JSON.stringify(`${RUN}-mentions`)})`,
      20_000,
    );
    await page.waitFor("Boolean(document.querySelector('.compose-box textarea'))");

    const noMentionMarker = `FMARK_${RUN}_NO_MENTION`;
    await sendCompose(page, noMentionMarker);
    await waitForCaptureContains(ctx, claudeId, [noMentionMarker, '"reason": "user-message"']);
    await waitForCaptureContains(ctx, codexId, [noMentionMarker, '"reason": "user-message"']);
    await waitForCaptureContains(ctx, geminiId, [noMentionMarker, '"reason": "user-message"']);
    pass("UI no-mention message wakes all three vendor runtime sessions", {
      sessionId,
      agents: [claudeId, codexId, geminiId],
    });

    const beforeMention = {
      claude: await wakeCount(ctx, claudeId),
      codex: await wakeCount(ctx, codexId),
      gemini: await wakeCount(ctx, geminiId),
    };
    const mentionMarker = `FMARK_${RUN}_MENTION_CODEX`;
    await sendComposeMention(page, mentionMarker, codexId);
    await waitForWakeCount(ctx, codexId, beforeMention.codex + 1);
    await waitForCaptureContains(ctx, codexId, [mentionMarker, '"reason": "mention"', codexId]);
    await assertWakeCountStable(ctx, claudeId, beforeMention.claude);
    await assertWakeCountStable(ctx, geminiId, beforeMention.gemini);
    const mentionEvent = await eventWithContent(port, sessionId, mentionMarker);
    assert(
      JSON.stringify(mentionEvent.payload.mentions ?? []).includes(codexId),
      "compose mention event did not persist codex participant id",
    );
    pass("UI compose mention wakes only selected agent and persists metadata", {
      sessionId,
      mentioned: codexId,
      event: mentionEvent.filename,
    });

    await api(port, "POST", `/managed-agents/${encodeURIComponent(codexId)}/pause`);
    await clickComposeMention(page);
    await page.waitFor("document.body.textContent.includes('Paused')");
    assert(
      await page.eval(`
(() => {
  const row = [...document.querySelectorAll('.agent-mention-row')]
    .find((item) => item.textContent && item.textContent.includes(${JSON.stringify(codexId)}));
  if (!row) return false;
  const choice = row.querySelector('.agent-mention-choice');
  return Boolean(choice && choice.disabled && row.textContent.includes('Resume'));
})()
`),
      "paused codex row was not disabled with Resume affordance",
    );
    const pausedWake = await api(port, "POST", `/sessions/${encodeURIComponent(sessionId)}/wake`, {
      reason: "mention",
      target_participant_ids: [codexId],
    });
    assert(pausedWake.notified.length === 0, "paused target was notified");
    assert(
      pausedWake.skipped.some((item) => item.participant_id === codexId && item.reason === "paused"),
      "paused target skip was not reported",
    );
    await clickMentionAction(page, codexId, "Resume");
    await page.waitFor(`
(() => {
  const row = [...document.querySelectorAll('.agent-mention-row')]
    .find((item) => item.textContent && item.textContent.includes(${JSON.stringify(codexId)}));
  return Boolean(row && row.textContent.includes('Connected'));
})()
`);
    pass("UI paused mention row offers Resume and backend mutes paused wake", {
      sessionId,
      paused: codexId,
    });

    await run("tmux", ["kill-session", "-t", spawnedGemini.tmux_session], {
      cwd: ctx.project,
      env: ctx.env,
    });
    await clickComposeMention(page);
    await page.waitFor(`
(() => {
  const row = [...document.querySelectorAll('.agent-mention-row')]
    .find((item) => item.textContent && item.textContent.includes(${JSON.stringify(geminiId)}));
  return Boolean(row && row.textContent.includes('Reconnect'));
})()
`, 10_000);
    await clickMentionAction(page, geminiId, "Reconnect");
    await page.waitFor(`
(() => {
  const row = [...document.querySelectorAll('.agent-mention-row')]
    .find((item) => item.textContent && item.textContent.includes(${JSON.stringify(geminiId)}));
  return Boolean(row && row.textContent.includes('Connected'));
})()
`, 15_000);
    await waitForWakeCount(ctx, geminiId, beforeMention.gemini + 1);
    pass("UI detached mention row offers Reconnect", {
      sessionId,
      reconnected: geminiId,
    });

    const targetMarker = `FMARK_${RUN}_COMMENT_TARGET`;
    await api(port, "POST", `/sessions/${encodeURIComponent(sessionId)}/events/prose`, {
      participant_id: geminiId,
      name: "Comment Target",
      content: `${targetMarker}\nline two for comment target`,
    });
    await page.send("Page.reload");
    await page.waitFor("Boolean(document.querySelector('.compose-box textarea'))");
    await openLineCommentDraft(page, targetMarker);
    const beforeComment = {
      claude: await wakeCount(ctx, claudeId),
      codex: await wakeCount(ctx, codexId),
      gemini: await wakeCount(ctx, geminiId),
    };
    const commentMarker = `FMARK_${RUN}_LINE_COMMENT`;
    await submitLineCommentWithMention(page, commentMarker, codexId);
    await waitForWakeCount(ctx, codexId, beforeComment.codex + 1);
    await waitForWakeCount(ctx, geminiId, beforeComment.gemini + 1);
    await assertWakeCountStable(ctx, claudeId, beforeComment.claude);
    const commentEvent = await eventWithContent(port, sessionId, commentMarker);
    assert(
      JSON.stringify(commentEvent.payload.mentions ?? []).includes(codexId),
      "line comment mention did not persist codex participant id",
    );
    pass("UI line comment wakes mentioned agent plus commented-content author", {
      sessionId,
      mentioned: codexId,
      author: geminiId,
      event: commentEvent.filename,
    });

    await page.waitFor("Boolean(document.querySelector('.right-comment-replybox input'))", 10_000);
    const beforeReply = {
      claude: await wakeCount(ctx, claudeId),
      codex: await wakeCount(ctx, codexId),
      gemini: await wakeCount(ctx, geminiId),
    };
    const replyMarker = `FMARK_${RUN}_RIGHT_REPLY`;
    await submitRightReplyWithMention(page, replyMarker, claudeId);
    await waitForWakeCount(ctx, claudeId, beforeReply.claude + 1);
    await waitForWakeCount(ctx, geminiId, beforeReply.gemini + 1);
    await assertWakeCountStable(ctx, codexId, beforeReply.codex);
    const replyEvent = await eventWithContent(port, sessionId, replyMarker);
    assert(
      JSON.stringify(replyEvent.payload.mentions ?? []).includes(claudeId),
      "right reply mention did not persist claude participant id",
    );
    pass("UI right-panel reply wakes mentioned agent plus commented-content author", {
      sessionId,
      mentioned: claudeId,
      author: geminiId,
      event: replyEvent.filename,
    });

    const beforeTodo = {
      claude: await wakeCount(ctx, claudeId),
      codex: await wakeCount(ctx, codexId),
      gemini: await wakeCount(ctx, geminiId),
    };
    const todoMarker = `FMARK_${RUN}_TODO`;
    await createTodoAssignedTo(page, todoMarker, claudeId);
    await waitForWakeCount(ctx, claudeId, beforeTodo.claude + 1);
    await assertWakeCountStable(ctx, codexId, beforeTodo.codex);
    await assertWakeCountStable(ctx, geminiId, beforeTodo.gemini);
    const todoEvent = await eventWithContent(port, sessionId, todoMarker);
    assert(todoEvent.payload.assigned_to === claudeId, "todo assignee metadata not persisted");
    pass("UI todo creation wakes assigned agent only", {
      sessionId,
      assigned: claudeId,
      event: todoEvent.filename,
    });

    await runClaudeMentionAgent(ctx, port, sessionId, userId);
    await runCodexMentionAgent(ctx, port, sessionId, userId);
    await runGeminiMentionAgent(ctx, port, sessionId, userId);

    pass("Phase 15 live session covered capture sessions and real vendors", {
      sessionId,
      captureAgents: [claudeId, codexId, geminiId],
      realVendors: ["claude", "codex", "gemini"],
      tmuxSessions: [
        spawnedClaude.tmux_session,
        spawnedCodex.tmux_session,
        spawnedGemini.tmux_session,
      ],
    });

    await writeFile(join(artifactRoot, "report.json"), JSON.stringify(report, null, 2));
    console.log(`HOT_TEST_REPORT ${join(artifactRoot, "report.json")}`);
    console.log(JSON.stringify({ run: RUN, artifactRoot, passes: report.checks.length }, null, 2));
  } catch (error) {
    if (artifactRoot === null) artifactRoot = await mkdtemp(join(tmpdir(), "fmark-mcp-phase15-hot-"));
    if (page !== null) {
      try {
        const debug = await page.eval(`JSON.stringify({
          url: location.href,
          title: document.title,
          text: document.body ? document.body.innerText : "",
          html: document.documentElement ? document.documentElement.outerHTML.slice(0, 6000) : ""
        }, null, 2)`);
        await writeFile(join(artifactRoot, "page-debug.json"), debug);
      } catch {
        // best-effort diagnostics only
      }
    }
    report.checks.push({
      name: "Phase 15 mentions and targeted wake hot runner",
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
