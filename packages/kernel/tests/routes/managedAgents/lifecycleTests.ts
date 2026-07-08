import { expect, it } from "vitest";
import Fastify from "fastify";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSession } from "../../../src/sessions.js";
import { createAgentStateStore } from "../../../src/services/agentState.js";
import { initProject } from "../../../src/project.js";
import { paths } from "../../../src/paths.js";
import { registerEventRoutes } from "../../../src/routes/events.js";
import { registerHtmlRoutes } from "../../../src/routes/html.js";
import { registerFlowRoutes } from "../../../src/routes/flow.js";
import { registerAlternativesRoutes } from "../../../src/routes/alternatives.js";
import { registerTodoRoutes } from "../../../src/routes/todos.js";
import { fakeCommandRunner } from "../../../src/tmux/commandRunner.js";
import { createTmuxManager } from "../../../src/tmux/manager.js";
import {
  fmarkAgentSessionName,
  fmarkTerminalSessionName,
} from "../../../src/tmux/naming.js";
import {
  deleteManagedAgentWithToken,
  expectManagedAgentsListSessions,
  expectManagedAgentUpdated,
  expectSpawnCalls,
  expectTerminalSpawnCalls,
  expectTmuxKilled,
  expectTmuxSessionLive,
  expectTmuxSessionsGone,
  fakeBus,
  getManagedAgents,
  makeApp,
} from "./fixtures.js";
import { writeManagedAgentFixture } from "./agents.js";

export function registerConfirmTokenTests(): void {
  it("returns a one-time token", returnsOneTimeToken);
  it("400 on invalid id", rejectsInvalidConfirmTokenId);
}

export function registerDeleteTests(): void {
  it("403 when no confirm token", rejectsMissingConfirmToken);
  it("403 when confirm token is wrong", rejectsWrongConfirmToken);
  it(
    "200 with valid confirm; kills tmux + clears siblings; second use → 403 (stale)",
    deletesWithValidConfirmToken,
  );
}

export function registerTerminalTests(): void {
  it("allocates sequential indices", allocatesSequentialTerminalIndices);
}

export function registerTerminalKillTests(): void {
  it(
    "kills an owned terminal and publishes managed-agent.terminal-closed",
    killsOwnedTerminal,
  );
  it("400 when the session is not a terminal", rejectsKillOfNonTerminal);
  it(
    "idempotent: ok without killing when the terminal is not live",
    killIdempotentWhenGone,
  );
}

export function registerListTests(): void {
  it("returns agents + terminals buckets", returnsAgentsAndTerminalsBuckets);
  it(
    "marks an agent dir whose tmux session is gone as alive: false",
    marksMissingTmuxAgentDead,
  );
}

export function registerLogTests(): void {
  it("returns appended log entries", returnsAppendedLogEntries);
  it("400 on invalid id", rejectsInvalidLogsId);
}

export function registerBusPublishingTests(): void {
  it(
    "POST /managed-agents/spawn publishes managed-agent.spawned",
    publishesManagedAgentSpawned,
  );
  it("DELETE /managed-agents/:id publishes managed-agent.killed", publishesKilled);
  it(
    "POST /managed-agents/terminal publishes managed-agent.terminal-spawned",
    publishesTerminalSpawned,
  );
}

export function registerEventWriteLifecycleTests(): void {
  it(
    "POST /sessions/:id/events/prose and turn-end reconcile managed lifecycle",
    reconcilesManagedLifecycleFromEventWrites,
  );
  it(
    "HTML, flow, todo, and alternatives writers share managed lifecycle reconciliation",
    reconcilesManagedLifecycleFromNonProseWriters,
  );
}

async function returnsOneTimeToken(): Promise<void> {
  const { app, cleanup } = await makeApp();
  const res = await app.inject({
    method: "GET",
    url: "/managed-agents/ag-claude/confirm-token",
  });
  expect(res.statusCode).toBe(200);
  expect(res.json().token).toMatch(/^[0-9a-f]{16}$/);
  await app.close();
  await cleanup();
}

async function rejectsInvalidConfirmTokenId(): Promise<void> {
  const { app, cleanup } = await makeApp();
  const res = await app.inject({
    method: "GET",
    url: "/managed-agents/..%2Fetc/confirm-token",
  });
  expect(res.statusCode).toBe(400);
  await app.close();
  await cleanup();
}

async function rejectsMissingConfirmToken(): Promise<void> {
  const { app, cleanup } = await makeApp();
  const res = await app.inject({
    method: "DELETE",
    url: "/managed-agents/ag-claude",
  });
  expect(res.statusCode).toBe(403);
  await app.close();
  await cleanup();
}

async function rejectsWrongConfirmToken(): Promise<void> {
  const { app, cleanup } = await makeApp();
  const tok = await app.inject({
    method: "GET",
    url: "/managed-agents/ag-claude/confirm-token",
  });
  expect(tok.statusCode).toBe(200);
  const res = await app.inject({
    method: "DELETE",
    url: "/managed-agents/ag-claude?confirm=wrong",
  });
  expect(res.statusCode).toBe(403);
  await app.close();
  await cleanup();
}

async function deletesWithValidConfirmToken(): Promise<void> {
  const { app, runner, p, cleanup } = await makeApp();
  expectSpawnCalls(runner);
  const spawn = await app.inject({
    method: "POST",
    url: "/managed-agents/spawn",
    payload: { runtime_id: "claude", suggested_participant_id: "ag-claude-k" },
  });
  expect(spawn.statusCode).toBe(200);

  const { res, token } = await deleteManagedAgentWithToken(
    app,
    runner,
    "ag-claude-k",
  );
  expect(res.json().ok).toBe(true);
  await expect(
    readFile(join(p.fmarkDir(), "agents", "ag-claude-k", "tmux-session"), "utf8"),
  ).rejects.toThrow();

  const res2 = await app.inject({
    method: "DELETE",
    url: `/managed-agents/ag-claude-k?confirm=${token}`,
  });
  expect(res2.statusCode).toBe(403);
  runner.verifyExpectationsConsumed();
  await app.close();
  await cleanup();
}

async function allocatesSequentialTerminalIndices(): Promise<void> {
  const { app, runner, root, cleanup } = await makeApp();
  expectTerminalSpawnCalls(runner);

  const r1 = await app.inject({
    method: "POST",
    url: "/managed-agents/terminal",
    payload: {},
  });
  expect(r1.statusCode).toBe(200);
  expect(r1.json().tmux_session).toMatch(/-term-1$/);
  expect(r1.json().label).toBe("terminal 1");

  expectManagedAgentsListSessions(runner, root, r1.json().tmux_session as string);
  runner.expect(["tmux", "new-session"], { stdout: "", stderr: "", exitCode: 0 });
  runner.expect(["tmux", "set-option"], { stdout: "", stderr: "", exitCode: 0 });
  const r2 = await app.inject({
    method: "POST",
    url: "/managed-agents/terminal",
    payload: { name: "shell" },
  });
  expect(r2.statusCode).toBe(200);
  expect(r2.json().tmux_session).toMatch(/-term-2$/);
  expect(r2.json().label).toBe("shell");
  runner.verifyExpectationsConsumed();
  await app.close();
  await cleanup();
}

async function returnsAgentsAndTerminalsBuckets(): Promise<void> {
  const { app, runner, root, p, cleanup } = await makeApp();
  expectSpawnCalls(runner);
  const spawn = await app.inject({
    method: "POST",
    url: "/managed-agents/spawn",
    payload: { runtime_id: "claude", suggested_participant_id: "ag-claude-list" },
  });
  expect(spawn.statusCode).toBe(200);
  const agentSession = spawn.json().tmux_session as string;
  await createAgentStateStore({ fallback: p }).updateControlState(
    "ag-claude-list",
    { activity_state: "notified" },
  );

  expectTerminalSpawnCalls(runner);
  const term = await app.inject({
    method: "POST",
    url: "/managed-agents/terminal",
    payload: {},
  });
  expect(term.statusCode).toBe(200);

  const termSession = term.json().tmux_session as string;
  expectManagedAgentsListSessions(runner, root, agentSession, termSession);
  const body = await getManagedAgents(app);
  expectListedAgent(body, agentSession);
  expect(body.terminals).toHaveLength(1);
  expect(body.terminals[0].tmux_session).toBe(termSession);
  runner.verifyExpectationsConsumed();
  await app.close();
  await cleanup();
}

function expectListedAgent(
  body: { agents: Array<Record<string, unknown>> },
  agentSession: string,
): void {
  expect(body.agents).toHaveLength(1);
  expect(body.agents[0].participant_id).toBe("ag-claude-list");
  expect(body.agents[0].tmux_session).toBe(agentSession);
  expect(body.agents[0].runtime_id).toBe("claude");
  expect(body.agents[0].alive).toBe(true);
  expect(body.agents[0].activity_state).toBe("notified");
}

async function marksMissingTmuxAgentDead(): Promise<void> {
  const { app, runner, p, cleanup } = await makeApp();
  const state = createAgentStateStore({ fallback: p });
  await state.writeTmuxSession(
    "ag-claude-stale",
    "fmark-test-12345678-ag-ag-claude-stale",
  );
  await state.writeRuntime("ag-claude-stale", "claude");

  expectTmuxSessionsGone(runner);
  const body = await getManagedAgents(app);
  expect(body.agents).toHaveLength(1);
  expect(body.agents[0].participant_id).toBe("ag-claude-stale");
  expect(body.agents[0].tmux_session).toBe(
    "fmark-test-12345678-ag-ag-claude-stale",
  );
  expect(body.agents[0].runtime_id).toBe("claude");
  expect(body.agents[0].alive).toBe(false);
  runner.verifyExpectationsConsumed();
  await app.close();
  await cleanup();
}

async function returnsAppendedLogEntries(): Promise<void> {
  const { app, runner, cleanup } = await makeApp();
  expectSpawnCalls(runner);
  const spawn = await app.inject({
    method: "POST",
    url: "/managed-agents/spawn",
    payload: { runtime_id: "claude", suggested_participant_id: "ag-claude-lg" },
  });
  expect(spawn.statusCode).toBe(200);
  const res = await app.inject({
    method: "GET",
    url: "/managed-agents/ag-claude-lg/logs?since=10",
  });
  expect(res.statusCode).toBe(200);
  const body = res.json();
  expect(Array.isArray(body.entries)).toBe(true);
  expect(body.entries.find((e: { event: string }) => e.event === "spawn"))
    .toBeTruthy();
  runner.verifyExpectationsConsumed();
  await app.close();
  await cleanup();
}

async function rejectsInvalidLogsId(): Promise<void> {
  const { app, cleanup } = await makeApp();
  const res = await app.inject({
    method: "GET",
    url: "/managed-agents/..%2Fetc/logs",
  });
  expect(res.statusCode).toBe(400);
  await app.close();
  await cleanup();
}

async function publishesManagedAgentSpawned(): Promise<void> {
  const bus = fakeBus();
  const { app, runner, p, cleanup } = await makeApp({ bus });
  const session = await createSession(p, { slug: "sess-bus" });
  expectSpawnCalls(runner);
  const res = await app.inject({
    method: "POST",
    url: "/managed-agents/spawn",
    payload: {
      runtime_id: "claude",
      suggested_participant_id: "ag-claude-bus",
      session_id: session.id,
    },
  });
  expect(res.statusCode).toBe(200);
  const spawned = bus.messages.find((m) => m.type === "managed-agent.spawned");
  expect(spawned).toBeDefined();
  expect(spawned).toMatchObject({
    type: "managed-agent.spawned",
    participant_id: "ag-claude-bus",
    runtime_id: "claude",
    active_session: session.id,
  });
  expect((spawned as { tmux_session: string }).tmux_session).toMatch(
    /-ag-ag-claude-bus$/,
  );
  runner.verifyExpectationsConsumed();
  await app.close();
  await cleanup();
}

async function publishesKilled(): Promise<void> {
  const bus = fakeBus();
  const { app, runner, cleanup } = await makeApp({ bus });
  expectSpawnCalls(runner);
  const spawn = await app.inject({
    method: "POST",
    url: "/managed-agents/spawn",
    payload: { runtime_id: "claude", suggested_participant_id: "ag-claude-kbus" },
  });
  expect(spawn.statusCode).toBe(200);
  await deleteManagedAgentWithToken(app, runner, "ag-claude-kbus");
  const killed = bus.messages.find((m) => m.type === "managed-agent.killed");
  expect(killed).toBeDefined();
  expect(killed).toMatchObject({
    type: "managed-agent.killed",
    participant_id: "ag-claude-kbus",
  });
  runner.verifyExpectationsConsumed();
  await app.close();
  await cleanup();
}

async function publishesTerminalSpawned(): Promise<void> {
  const bus = fakeBus();
  const { app, runner, cleanup } = await makeApp({ bus });
  expectTerminalSpawnCalls(runner);
  const res = await app.inject({
    method: "POST",
    url: "/managed-agents/terminal",
    payload: { name: "scratch" },
  });
  expect(res.statusCode).toBe(200);
  const term = bus.messages.find(
    (m) => m.type === "managed-agent.terminal-spawned",
  );
  expect(term).toBeDefined();
  expect(term).toMatchObject({
    type: "managed-agent.terminal-spawned",
    label: "scratch",
  });
  expect((term as { tmux_session: string }).tmux_session).toMatch(/-term-1$/);
  runner.verifyExpectationsConsumed();
  await app.close();
  await cleanup();
}

async function reconcilesManagedLifecycleFromEventWrites(): Promise<void> {
  const ctx = await makeEventLifecycleApp();
  try {
    const session = await createSession(ctx.p, { slug: "event-lifecycle" });
    const participantId = "ag-event-life";
    const { state, tmuxSession } = await writeManagedAgentFixture({
      p: ctx.p,
      root: ctx.root,
      participantId,
      runtimeId: "claude",
      sessionId: session.id,
    });
    await state.updateControlState(participantId, { activity_state: "notified" });

    expectLifecycleStatusList(ctx.runner, tmuxSession);
    const prose = await ctx.app.inject({
      method: "POST",
      url: `/sessions/${session.id}/events/prose`,
      payload: {
        root: ctx.root,
        participant_id: participantId,
        content: "visible work",
      },
    });
    expect(prose.statusCode, prose.body).toBe(200);
    expect(await state.readControlState(participantId)).toMatchObject({
      activity_state: "running",
    });
    expectManagedAgentUpdated(ctx.bus, participantId, "running");

    expectLifecycleStatusList(ctx.runner, tmuxSession);
    const turnEnd = await ctx.app.inject({
      method: "POST",
      url: `/sessions/${session.id}/events/turn-end`,
      payload: { root: ctx.root, participant_id: participantId },
    });
    expect(turnEnd.statusCode, turnEnd.body).toBe(200);
    const filename = turnEnd.json().filename as string;
    const timestamp = filename.split("_", 1)[0];
    expect(await state.readControlState(participantId)).toMatchObject({
      activity_state: "turn-ended",
    });
    expect(await state.readInboxCursor(participantId, session.id)).toBe(timestamp);
    expectManagedAgentUpdated(ctx.bus, participantId, "turn-ended");

    ctx.runner.verifyExpectationsConsumed();
  } finally {
    await ctx.cleanup();
  }
}

async function reconcilesManagedLifecycleFromNonProseWriters(): Promise<void> {
  const ctx = await makeEventLifecycleApp();
  try {
    const session = await createSession(ctx.p, { slug: "non-prose-lifecycle" });
    const participantId = "ag-non-prose-life";
    const { state, tmuxSession } = await writeManagedAgentFixture({
      p: ctx.p,
      root: ctx.root,
      participantId,
      runtimeId: "claude",
      sessionId: session.id,
    });

    const cases = [
      {
        url: `/sessions/${session.id}/events/html`,
        payload: { participant_id: participantId, html: "<p>html work</p>" },
      },
      {
        url: `/sessions/${session.id}/events/flow`,
        payload: {
          participant_id: participantId,
          id: "flow-life",
          nodes: [{ id: "n1", label: "Node 1" }],
          edges: [],
        },
      },
      {
        url: `/sessions/${session.id}/events/todo`,
        payload: {
          participant_id: participantId,
          id: "todo-life",
          title: "Non-prose work",
          status: "open",
        },
      },
      {
        url: `/sessions/${session.id}/events/alternatives`,
        payload: {
          participant_id: participantId,
          id: "alts-life",
          question: "Pick one",
          options: [{ id: "a", label: "A", html: "<p>A</p>" }],
          multi: false,
        },
      },
    ];

    for (const item of cases) {
      await state.updateControlState(participantId, {
        activity_state: "notified",
      });
      const before = ctx.bus.messages.length;
      expectLifecycleStatusList(ctx.runner, tmuxSession);
      const res = await ctx.app.inject({
        method: "POST",
        url: item.url,
        payload: { ...item.payload, root: ctx.root },
      });
      expect(res.statusCode, res.body).toBe(200);
      expect(await state.readControlState(participantId)).toMatchObject({
        activity_state: "running",
      });
      expect(
        ctx.bus.messages.slice(before).some(
          (msg) =>
            msg.type === "managed-agent.updated" &&
            msg.agent.participant_id === participantId &&
            msg.agent.activity_state === "running",
        ),
      ).toBe(true);
    }

    ctx.runner.verifyExpectationsConsumed();
  } finally {
    await ctx.cleanup();
  }
}

async function makeEventLifecycleApp(): Promise<{
  app: ReturnType<typeof Fastify>;
  bus: ReturnType<typeof fakeBus>;
  cleanup(): Promise<void>;
  p: ReturnType<typeof paths>;
  root: string;
  runner: ReturnType<typeof fakeCommandRunner>;
}> {
  const root = await mkdtemp(join(tmpdir(), "fmark-event-life-"));
  const p = paths(root);
  await initProject(p);
  const runner = fakeCommandRunner();
  const tmux = createTmuxManager({ runner, projectRoot: root });
  const bus = fakeBus();
  const app = Fastify();
  const deps = {
    fallback: p,
    getTmuxManager: () => tmux,
  };
  registerEventRoutes(app, deps, () => bus);
  registerHtmlRoutes(app, deps, () => bus);
  registerFlowRoutes(app, deps, () => bus);
  registerAlternativesRoutes(app, deps, () => bus);
  registerTodoRoutes(app, deps, () => bus);
  return {
    app,
    bus,
    cleanup: async () => {
      await app.close();
      await rm(root, { recursive: true, force: true });
    },
    p,
    root,
    runner,
  };
}

function expectLifecycleStatusList(
  runner: ReturnType<typeof fakeCommandRunner>,
  tmuxSession: string,
): void {
  runner.expect(["tmux", "ls"], {
    stdout: `${tmuxSession}|1710000000\n`,
    stderr: "",
    exitCode: 0,
  });
}

async function killsOwnedTerminal(): Promise<void> {
  const bus = fakeBus();
  const { app, runner, root, cleanup } = await makeApp({ bus });
  const session = fmarkTerminalSessionName(root, 1);

  // isLiveFmarkSession() confirms ownership from the session name, then checks pane liveness.
  runner.expect(["tmux", "display-message"], {
    stdout: "0\n",
    stderr: "",
    exitCode: 0,
  });
  runner.expect(["tmux", "kill-session"], { stdout: "", stderr: "", exitCode: 0 });

  const res = await app.inject({
    method: "DELETE",
    url: "/managed-agents/terminal",
    payload: { tmux_session: session },
  });
  expect(res.statusCode).toBe(200);
  expect(res.json().ok).toBe(true);
  expectTmuxKilled(runner);
  expect(
    bus.messages.find((m) => m.type === "managed-agent.terminal-closed"),
  ).toMatchObject({
    type: "managed-agent.terminal-closed",
    tmux_session: session,
  });
  runner.verifyExpectationsConsumed();
  await app.close();
  await cleanup();
}

async function rejectsKillOfNonTerminal(): Promise<void> {
  const { app, root, cleanup } = await makeApp();
  const res = await app.inject({
    method: "DELETE",
    url: "/managed-agents/terminal",
    payload: { tmux_session: fmarkAgentSessionName(root, "ag-claude-x") },
  });
  expect(res.statusCode).toBe(400);
  await app.close();
  await cleanup();
}

async function killIdempotentWhenGone(): Promise<void> {
  const bus = fakeBus();
  const { app, runner, root, cleanup } = await makeApp({ bus });
  const session = fmarkTerminalSessionName(root, 7);

  // isLiveFmarkSession() sees the owned terminal name but the pane is gone.
  runner.expect(["tmux", "display-message"], {
    stdout: "",
    stderr: "no session",
    exitCode: 1,
  });

  const res = await app.inject({
    method: "DELETE",
    url: "/managed-agents/terminal",
    payload: { tmux_session: session },
  });
  expect(res.statusCode).toBe(200);
  expect(res.json().ok).toBe(true);
  // Nothing was killed, and no close event was published.
  expect(
    runner.calls.some((c) => c[0] === "tmux" && c[1] === "kill-session"),
  ).toBe(false);
  expect(
    bus.messages.some((m) => m.type === "managed-agent.terminal-closed"),
  ).toBe(false);
  runner.verifyExpectationsConsumed();
  await app.close();
  await cleanup();
}
