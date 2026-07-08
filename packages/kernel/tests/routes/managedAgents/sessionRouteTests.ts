import { expect, it } from "vitest";
import { createSession } from "../../../src/sessions.js";
import { readEvents } from "../../../src/events/reader.js";
import { registerAgent } from "../../../src/participants.js";
import { writeAccessRequestEvent } from "../../../src/services/events.js";
import { FMARK_LAUNCH_PROMPT_MARKER } from "../../../src/launchPrompt.js";
import { fakeCommandRunner } from "../../../src/tmux/commandRunner.js";
import {
  ensureManagedAgents,
  expectEnsureManagedAgentsSkipped,
  expectManagedAgentsListSessions,
  expectManagedAgentUpdated,
  expectNoTmuxSendKeys,
  expectSpawnCalls,
  expectTmuxSessionsGone,
  fakeBus,
  getNewSessionCall,
  makeApp,
} from "./fixtures.js";
import {
  makeScopedManagedAgentsApp,
  withBackgroundPathFixture,
} from "./scopedPaths.js";
import {
  userParticipantId,
  writeManagedAgentFixture,
  writeUserProseEvent,
} from "./agents.js";

type ManagedAgentState = Awaited<ReturnType<typeof writeManagedAgentFixture>>["state"];

export function registerInboxTests(): void {
  it(
    "does not mark an agent running when it peeks non-empty inbox work",
    peeksInboxWorkWithoutChangingActivityState,
  );
  it(
    "resolves inbox and mark-seen against a scoped background root",
    resolvesInboxAndMarkSeenAgainstBackgroundRoot,
  );
}

export function registerAccessResponseTests(): void {
  it(
    "writes a response into a scoped background root",
    writesAccessResponseIntoScopedBackgroundRoot,
  );
}

export function registerWakeTests(): void {
  it(
    "focus ensure resumes a stopped Claude pane without sending a wake prompt",
    focusEnsureResumesStoppedClaudePane,
  );
  it(
    "focus ensure skips Claude resume when no native session id is available",
    focusEnsureSkipsMissingClaudeNativeSession,
  );
  it(
    "focus ensure idle_only skips dead panes that were not idle-stopped",
    focusEnsureSkipsNonIdleStoppedPane,
  );
  it(
    "resumes a missing Codex pane by native id before delivering the wake prompt",
    resumesMissingCodexPaneBeforeWakePrompt,
  );
  it(
    "resumes a missing Opencode pane before delivering the wake prompt",
    resumesMissingOpencodePaneBeforeWakePrompt,
  );
  it(
    "does not mark a Codex agent running when a wake packet has no unread events",
    codexWakeWithEmptyInboxPreservesActivityState,
  );
}

async function codexWakeWithEmptyInboxPreservesActivityState(): Promise<void> {
  const bus = fakeBus();
  const { app, runner, root, p, cleanup } = await makeApp({ bus });
  const session = await createSession(p, { slug: "codex-empty-wake" });
  const participantId = "ag-codex-empty-wake";
  const { state, tmuxSession } = await writeManagedAgentFixture({
    p,
    root,
    participantId,
    runtimeId: "codex",
    sessionId: session.id,
  });
  await state.writeInboxCursor(
    participantId,
    session.id,
    "20260629T120000.000Z",
  );
  await state.updateControlState(participantId, {
    activity_state: "idle",
    pane_lifecycle: "live",
  });
  expectCodexAlreadyLiveWakeProbe(runner, tmuxSession);

  const res = await app.inject({
    method: "POST",
    url: `/sessions/${session.id}/wake`,
    payload: {
      target_participant_ids: [participantId],
      reason: "debug-check",
      root,
    },
  });

  expect(res.statusCode, res.body).toBe(200);
  expect(res.json().delivered, res.body).toEqual([]);
  expect(res.json().notified, res.body).toEqual([]);
  expect(res.json().event_count).toBe(0);
  expect(res.json().skipped).toEqual([
    { participant_id: participantId, reason: "no-unread-events" },
  ]);
  expect(await state.readControlState(participantId)).toMatchObject({
    activity_state: "idle",
  });
  expectNoTmuxSendKeys(runner);
  runner.verifyExpectationsConsumed();
  await app.close();
  await cleanup();
}

async function peeksInboxWorkWithoutChangingActivityState(): Promise<void> {
  const bus = fakeBus();
  const { app, runner, root, p, cleanup } = await makeApp({ bus });
  const session = await createSession(p, { slug: "inbox-running" });
  await writeUserProseEvent(p, session.id, "Please inspect this.");

  const participantId = "ag-claude-inbox";
  const { state } = await writeManagedAgentFixture({
    p,
    root,
    participantId,
    runtimeId: "claude",
  });
  await state.updateControlState(participantId, { activity_state: "notified" });

  const res = await app.inject({
    method: "GET",
    url: `/sessions/${encodeURIComponent(session.id)}/inbox?participant_id=${participantId}`,
  });

  expect(res.statusCode).toBe(200);
  expect(res.json().events.length).toBeGreaterThan(0);
  expect(await state.readControlState(participantId)).toMatchObject({
    activity_state: "notified",
  });
  expect(
    bus.messages.some(
      (msg) =>
        msg.type === "managed-agent.updated" &&
        msg.agent.participant_id === participantId,
    ),
  ).toBe(false);
  runner.verifyExpectationsConsumed();
  await app.close();
  await cleanup();
}

async function resolvesInboxAndMarkSeenAgainstBackgroundRoot(): Promise<void> {
  await withBackgroundPathFixture("fmark-inbox", async (ctx) => {
    const session = await createSession(ctx.background, { slug: "inbox-bg" });
    const { app } = makeScopedManagedAgentsApp({
      fallback: ctx.fallback,
      activeRoot: ctx.activeRoot,
      ref: ctx.ref,
    });

    const unscoped = await app.inject({
      method: "GET",
      url: `/sessions/${encodeURIComponent(session.id)}/inbox?participant_id=ag-bg-inbox`,
    });
    expect(unscoped.statusCode).toBe(404);

    const scoped = await app.inject({
      method: "GET",
      url: `/sessions/${encodeURIComponent(
        session.id,
      )}/inbox?participant_id=ag-bg-inbox&path_id=${ctx.backgroundPath.pathId()}`,
    });
    expect(scoped.statusCode, scoped.body).toBe(200);

    const markSeen = await app.inject({
      method: "POST",
      url: `/sessions/${encodeURIComponent(session.id)}/mark-seen`,
      payload: {
        participant_id: "ag-bg-inbox",
        path_id: ctx.backgroundPath.pathId(),
      },
    });
    expect(markSeen.statusCode, markSeen.body).toBe(200);
    expect(markSeen.json()).toMatchObject({
      session_id: session.id,
      participant_id: "ag-bg-inbox",
    });
    await app.close();
  });
}

async function writesAccessResponseIntoScopedBackgroundRoot(): Promise<void> {
  await withBackgroundPathFixture("fmark-access", async (ctx) => {
    const session = await createSession(ctx.background, { slug: "access-bg" });
    const userId = await userParticipantId(ctx.background);
    await writeScopedAccessRequest(ctx.background, session.id);
    const runner = fakeCommandRunner();
    const { app } = makeScopedManagedAgentsApp({
      fallback: ctx.fallback,
      activeRoot: ctx.activeRoot,
      ref: ctx.ref,
      runner,
    });

    expectTmuxSessionsGone(runner);
    expectTmuxSessionsGone(runner);
    const response = await app.inject({
      method: "POST",
      url: "/managed-agents/ag-bg-access/access-requests/ar-bg-1/respond",
      payload: {
        session_id: session.id,
        participant_id: userId,
        decision: "approve",
        path_id: ctx.backgroundPath.pathId(),
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      delivered: true,
      delivery: "hook",
      status: "approved",
    });
    await expectScopedAccessResponseEvent(ctx.background, session.id);
    runner.verifyExpectationsConsumed();
    await app.close();
  });
}

async function writeScopedAccessRequest(
  p: Parameters<typeof userParticipantId>[0],
  sessionId: string,
): Promise<void> {
  await registerAgent(p, {
    name: "Claude",
    suggested_id: "ag-bg-access",
    runtime_id: "claude",
    knownRuntimeIds: new Set(["claude"]),
  });
  await writeAccessRequestEvent(p, sessionId, {
    participant_id: "ag-bg-access",
    schema: "fmark.access-request.v1",
    request_id: "ar-bg-1",
    status: "open",
    request_type: "command",
    runtime_id: "claude",
    hook_event_name: "TerminalApproval",
    title: "Bash command",
    command: "echo scoped",
    response_channel: "hook",
    created_at: "2026-06-18T16:00:00.000Z",
  });
}

async function expectScopedAccessResponseEvent(
  p: Parameters<typeof userParticipantId>[0],
  sessionId: string,
): Promise<void> {
  expect(
    (await readEvents(p, sessionId, { kinds: ["access-response"] })).some(
      (event) =>
        event.kind === "access-response" && event.payload.request_id === "ar-bg-1",
    ),
  ).toBe(true);
}

async function focusEnsureResumesStoppedClaudePane(): Promise<void> {
  const bus = fakeBus();
  const { app, runner, root, p, cleanup } = await makeApp({ bus });
  const session = await createSession(p, { slug: "claude-ensure" });
  const participantId = "ag-claude-ensure";
  const { state, tmuxSession } = await writeManagedAgentFixture({
    p,
    root,
    participantId,
    runtimeId: "claude",
    sessionId: session.id,
  });
  await state.writeRuntimeSession(participantId, {
    desired_name: session.id,
    native_name_applied: false,
    native_session_id: "claude-native-1",
    native_transcript_path: "/tmp/claude.jsonl",
    native_id_source: "hook",
  });
  await markPaneIdleStopped(state, participantId, tmuxSession);

  expectTmuxSessionsGone(runner);
  expectSpawnCalls(runner);
  expectManagedAgentsListSessions(runner, root, tmuxSession);

  const body = await ensureManagedAgents(app, session.id, root);
  expect(body).toMatchObject({
    session_id: session.id,
    resumed: [{ participant_id: participantId, tmux_session: tmuxSession }],
    already_live: [],
    skipped: [],
  });
  expectClaudeResumeCall(runner);
  expect(await state.readControlState(participantId)).toMatchObject({
    activity_state: "idle",
    pane_lifecycle: "live",
    idle_stopped_at: null,
  });
  runner.verifyExpectationsConsumed();
  await app.close();
  await cleanup();
}

async function markPaneIdleStopped(
  state: ManagedAgentState,
  participantId: string,
  tmuxSession: string,
): Promise<void> {
  await state.updateControlState(participantId, {
    idle_stopped_at: "2026-01-01T00:00:00.000Z",
    idle_stop_reason: "idle-timeout",
    last_tmux_session: tmuxSession,
    pane_lifecycle: "idle-stopped",
  });
}

function expectClaudeResumeCall(
  runner: Parameters<typeof getNewSessionCall>[0],
): void {
  const newSessionCall = getNewSessionCall(runner);
  expect(newSessionCall).toContain("claude");
  expect(newSessionCall).toContain("--resume");
  expect(newSessionCall).toContain("claude-native-1");
  expectNoTmuxSendKeys(runner);
}

async function focusEnsureSkipsMissingClaudeNativeSession(): Promise<void> {
  const { app, runner, root, p, cleanup } = await makeApp();
  const session = await createSession(p, { slug: "claude-missing-native" });
  const participantId = "ag-cl-no-native";
  const { state } = await writeManagedAgentFixture({
    p,
    root,
    participantId,
    runtimeId: "claude",
    sessionId: session.id,
    tmuxSession: "fmark-old-dead",
  });
  await state.writeRuntimeSession(participantId, {
    desired_name: session.id,
    native_name_applied: false,
  });
  await markPaneIdleStopped(state, participantId, "fmark-old-dead");

  await expectEnsureManagedAgentsSkipped(app, runner, session.id, root, {
    participant_id: participantId,
    reason: "missing-native-session-id",
    detail:
      "Claude resume requires a provider session id or a provider-applied F-Mark session name",
  });
  runner.verifyExpectationsConsumed();
  await app.close();
  await cleanup();
}

async function focusEnsureSkipsNonIdleStoppedPane(): Promise<void> {
  const { app, runner, root, p, cleanup } = await makeApp();
  const session = await createSession(p, { slug: "claude-manual-stop" });
  const participantId = "ag-cl-manual";
  const { state } = await writeManagedAgentFixture({
    p,
    root,
    participantId,
    runtimeId: "claude",
    sessionId: session.id,
    tmuxSession: "fmark-old-dead",
  });
  await state.writeRuntimeSession(participantId, {
    desired_name: session.id,
    native_name_applied: false,
    native_session_id: "claude-native-1",
    native_id_source: "hook",
  });

  await expectEnsureManagedAgentsSkipped(app, runner, session.id, root, {
    participant_id: participantId,
    reason: "not-idle-stopped",
    detail: "pane lifecycle is unknown",
  });
  runner.verifyExpectationsConsumed();
  await app.close();
  await cleanup();
}

async function resumesMissingCodexPaneBeforeWakePrompt(): Promise<void> {
  const bus = fakeBus();
  const { app, runner, root, p, cleanup } = await makeApp({ bus });
  const session = await createSession(p, { slug: "codex-wake" });
  await writeUserProseEvent(p, session.id, "Run the Codex wake task.");
  const participantId = "ag-codex-wake";
  const { state, tmuxSession } = await writeManagedAgentFixture({
    p,
    root,
    participantId,
    runtimeId: "codex",
    sessionId: session.id,
  });
  await writeCodexRuntimeSession(state, participantId, session.id);
  expectCodexWakeTmuxFlow(runner, tmuxSession, root);

  const res = await app.inject({
    method: "POST",
    url: `/sessions/${session.id}/wake`,
    payload: {
      target_participant_ids: [participantId],
      reason: "user-message",
      root,
    },
  });

  expect(res.statusCode).toBe(200);
  expect(res.json().notified).toEqual([participantId]);
  expect(res.json().delivered[0].tmux_session).toBe(tmuxSession);
  expect(res.json().skipped).toEqual([]);
  expectCodexResumeAndWakePrompt(runner);
  expect(await state.readControlState(participantId)).toMatchObject({
    activity_state: "notified",
  });
  expect(await state.readRuntimeSession(participantId)).toMatchObject({
    native_session_id: "codex-native-1",
    native_transcript_path: "/tmp/codex-rollout.jsonl",
  });
  expectManagedAgentUpdated(bus, participantId, "notified");
  runner.verifyExpectationsConsumed();
  await app.close();
  await cleanup();
}

async function resumesMissingOpencodePaneBeforeWakePrompt(): Promise<void> {
  const bus = fakeBus();
  const { app, runner, root, p, cleanup } = await makeApp({ bus });
  const session = await createSession(p, { slug: "opencode-wake" });
  await writeUserProseEvent(p, session.id, "Run the Opencode wake task.");
  const participantId = "ag-opencode-wake";
  const { state, tmuxSession } = await writeManagedAgentFixture({
    p,
    root,
    participantId,
    runtimeId: "opencode",
    sessionId: session.id,
  });
  await state.updateControlState(participantId, {
    access_mode: "dangerously-skip-permissions",
  });
  expectOpencodeWakeTmuxFlow(runner, tmuxSession, root);

  const res = await app.inject({
    method: "POST",
    url: `/sessions/${session.id}/wake`,
    payload: {
      target_participant_ids: [participantId],
      reason: "user-message",
      root,
    },
  });

  expect(res.statusCode).toBe(200);
  expect(res.json().notified).toEqual([participantId]);
  expect(res.json().delivered[0].tmux_session).toBe(tmuxSession);
  expect(res.json().skipped).toEqual([]);
  expectOpencodeResumeAndWakePrompt(runner, session.id);
  expect(await state.readControlState(participantId)).toMatchObject({
    activity_state: "notified",
    pane_lifecycle: "live",
  });
  expectManagedAgentUpdated(bus, participantId, "notified");
  runner.verifyExpectationsConsumed();
  await app.close();
  await cleanup();
}

async function writeCodexRuntimeSession(
  state: ManagedAgentState,
  participantId: string,
  sessionId: string,
): Promise<void> {
  await state.writeRuntimeSession(participantId, {
    desired_name: sessionId,
    native_name_applied: false,
    native_session_id: "codex-native-1",
    native_transcript_path: "/tmp/codex-rollout.jsonl",
    native_id_source: "hook",
  });
}

function expectCodexAlreadyLiveWakeProbe(
  runner: Parameters<typeof getNewSessionCall>[0],
  tmuxSession: string,
): void {
  expectTmuxListSessionsWithLivePane(runner, tmuxSession);
}

function expectTmuxListSessionsWithLivePane(
  runner: Parameters<typeof getNewSessionCall>[0],
  tmuxSession: string,
): void {
  runner.expect(["tmux", "ls"], {
    stdout: `${tmuxSession}|1710000000\n`,
    stderr: "",
    exitCode: 0,
  });
}

function expectWakePromptDelivery(
  runner: Parameters<typeof getNewSessionCall>[0],
): void {
  runner.expect(["tmux", "load-buffer"], { stdout: "", stderr: "", exitCode: 0 });
  runner.expect(["tmux", "paste-buffer"], { stdout: "", stderr: "", exitCode: 0 });
  runner.expect(["tmux", "send-keys"], { stdout: "", stderr: "", exitCode: 0 });
  runner.expect(["tmux", "send-keys"], { stdout: "", stderr: "", exitCode: 0 });
}

function expectCodexWakeTmuxFlow(
  runner: Parameters<typeof getNewSessionCall>[0],
  tmuxSession: string,
  root: string,
): void {
  expectTmuxSessionsGone(runner);
  expectSpawnCalls(runner);
  expectManagedAgentsListSessions(runner, root, tmuxSession);
  runner.expect(["tmux", "capture-pane"], { stdout: "", stderr: "", exitCode: 0 });
  expectWakePromptDelivery(runner);
  expectManagedAgentsListSessions(runner, root, tmuxSession);
}

function expectOpencodeWakeTmuxFlow(
  runner: Parameters<typeof getNewSessionCall>[0],
  tmuxSession: string,
  root: string,
): void {
  expectTmuxSessionsGone(runner);
  expectSpawnCalls(runner);
  expectManagedAgentsListSessions(runner, root, tmuxSession);
  runner.expect(["tmux", "capture-pane"], { stdout: "", stderr: "", exitCode: 0 });
  expectWakePromptDelivery(runner);
  expectManagedAgentsListSessions(runner, root, tmuxSession);
}

function expectCodexResumeAndWakePrompt(
  runner: Parameters<typeof getNewSessionCall>[0],
  expectedContent = "Run the Codex wake task.",
): void {
  const newSessionCall = getNewSessionCall(runner);
  expect(newSessionCall).toContain("codex");
  expect(newSessionCall).toContain("resume");
  expect(newSessionCall).toContain("codex-native-1");
  expect(String(newSessionCall?.join(" "))).not.toContain(FMARK_LAUNCH_PROMPT_MARKER);
  const pasted = deliveredPromptText(runner);
  expect(pasted).toContain("fmark.wake");
  if (expectedContent.length > 0) {
    expect(pasted).toContain(expectedContent);
  }
}

/* The prompt travels via `tmux load-buffer -` stdin (bracketed paste), so the
   content lives in the runner's recorded inputs, not in any argv. */
function deliveredPromptText(
  runner: Parameters<typeof getNewSessionCall>[0],
): string {
  const idx = runner.calls.findIndex(
    (call) => call[0] === "tmux" && call[1] === "load-buffer",
  );
  expect(idx).toBeGreaterThanOrEqual(0);
  return String(runner.inputs[idx]);
}

function expectOpencodeResumeAndWakePrompt(
  runner: Parameters<typeof getNewSessionCall>[0],
  sessionId: string,
): void {
  const newSessionCall = getNewSessionCall(runner);
  expect(newSessionCall).toContain("opencode");
  expect(newSessionCall).toContain("run");
  expect(newSessionCall).toContain("--session");
  expect(newSessionCall).toContain(sessionId);
  expect(newSessionCall).toContain("--dangerously-skip-permissions");
  const pasted = deliveredPromptText(runner);
  expect(pasted).toContain("fmark.wake");
  expect(pasted).toContain("Run the Opencode wake task.");
}
