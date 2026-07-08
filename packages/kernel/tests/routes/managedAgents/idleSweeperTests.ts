import { expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sweepIdleManagedAgentPanes } from "../../../src/routes/managedAgents/idleSweeper.js";
import { initProject } from "../../../src/project.js";
import { paths } from "../../../src/paths.js";
import { registerAgent } from "../../../src/participants.js";
import { createPresenceTracker } from "../../../src/presence/tracker.js";
import { createAgentStateStore } from "../../../src/services/agentState.js";
import type { ListedSession, TmuxManager } from "../../../src/tmux/manager.js";
import type { ProjectPaths } from "./fixtures.js";

const OLD_ACTIVITY_AT = "2026-06-18T08:00:00.000Z";
const SWEEP_NOW_MS = Date.parse("2026-06-18T09:01:00.000Z");

export function registerIdleSweeperTests(): void {
  it(
    "stops only idle managed agent panes and preserves provider resume metadata",
    stopsIdleManagedAgentPanes,
  );
  it(
    "skips access-pending panes even when tmux activity is old",
    skipsAccessPendingPanes,
  );
}

async function stopsIdleManagedAgentPanes(): Promise<void> {
  const fixture = await createIdleAgentFixture("fmark-idle-sweep-", "ag-idle-sweep");
  try {
    await writeIdleResumeMetadata(fixture);
    const killed: string[] = [];
    const tmux = fakeSweepTmux([
      agentSession("fmark-idle-ag", fixture.participantId),
      terminalSession("fmark-term-1"),
    ], killed);

    await runIdleSweep(fixture.p, tmux);

    expect(killed).toEqual(["fmark-idle-ag"]);
    await expectIdleResumeMetadataPreserved(fixture);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
}

async function skipsAccessPendingPanes(): Promise<void> {
  const fixture = await createIdleAgentFixture(
    "fmark-idle-access-",
    "ag-idle-access",
  );
  try {
    await fixture.state.writeTmuxSession(fixture.participantId, "fmark-access-ag");
    await fixture.state.writeRuntime(fixture.participantId, "claude");
    await fixture.state.writeControlState(fixture.participantId, {
      paused: false,
      activity_state: "access-pending",
      access_mode: "default",
      last_activity_at: OLD_ACTIVITY_AT,
      updated_at: OLD_ACTIVITY_AT,
    });
    const killed: string[] = [];
    const tmux = fakeSweepTmux([
      agentSession("fmark-access-ag", fixture.participantId),
    ], killed);

    await runIdleSweep(fixture.p, tmux);

    expect(killed).toEqual([]);
    expect(await fixture.state.readControlState(fixture.participantId)).toMatchObject({
      activity_state: "access-pending",
    });
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
}

async function createIdleAgentFixture(prefix: string, participantId: string): Promise<{
  root: string;
  p: ProjectPaths;
  participantId: string;
  state: ReturnType<typeof createAgentStateStore>;
}> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const p = paths(root);
  await initProject(p);
  await registerAgent(p, {
    name: participantId === "ag-idle-sweep" ? "Idle Agent" : "Access Agent",
    suggested_id: participantId,
    runtime_id: "claude",
    knownRuntimeIds: new Set(["claude"]),
  });
  return {
    root,
    p,
    participantId,
    state: createAgentStateStore({ fallback: p }),
  };
}

async function writeIdleResumeMetadata(fixture: {
  participantId: string;
  state: ReturnType<typeof createAgentStateStore>;
}): Promise<void> {
  const { participantId, state } = fixture;
  await state.writeTmuxSession(participantId, "fmark-idle-ag");
  await state.writeRuntime(participantId, "claude");
  await state.writeActiveSession(participantId, "sess-1");
  await state.writeRuntimeSession(participantId, {
    desired_name: "sess-1",
    native_name_applied: false,
    native_session_id: "native-idle-1",
    native_transcript_path: "/tmp/native.jsonl",
    native_id_source: "hook",
  });
  await state.writeControlState(participantId, {
    paused: false,
    activity_state: "idle",
    access_mode: "default",
    last_activity_at: OLD_ACTIVITY_AT,
    updated_at: OLD_ACTIVITY_AT,
  });
}

async function runIdleSweep(p: ProjectPaths, tmux: TmuxManager): Promise<void> {
  await sweepIdleManagedAgentPanes({
    paths: p,
    tmux,
    tracker: createPresenceTracker({ broadcast: () => {} }),
    now: () => SWEEP_NOW_MS,
  });
}

async function expectIdleResumeMetadataPreserved(fixture: {
  participantId: string;
  state: ReturnType<typeof createAgentStateStore>;
}): Promise<void> {
  const { participantId, state } = fixture;
  expect(await state.readRuntime(participantId)).toBe("claude");
  expect(await state.readTmuxSession(participantId)).toBe("fmark-idle-ag");
  expect(await state.readRuntimeSession(participantId)).toMatchObject({
    native_session_id: "native-idle-1",
    native_transcript_path: "/tmp/native.jsonl",
  });
  expect(await state.readControlState(participantId)).toMatchObject({
    activity_state: "idle",
    idle_stopped_at: "2026-06-18T09:01:00.000Z",
    idle_stop_reason: "idle-timeout",
    last_tmux_session: "fmark-idle-ag",
    pane_lifecycle: "idle-stopped",
  });
}

function fakeSweepTmux(sessions: ListedSession[], killed: string[]): TmuxManager {
  return {
    async listFmarkSessions() {
      return sessions;
    },
    async isLiveFmarkSession(sessionName: string) {
      return sessions.some((session) => session.sessionName === sessionName);
    },
    async killSession(name: string) {
      killed.push(name);
    },
  } as TmuxManager;
}

function agentSession(sessionName: string, participantId: string): ListedSession {
  return {
    sessionName,
    kind: "agent",
    participantId,
    lastActivityAt: OLD_ACTIVITY_AT,
  };
}

function terminalSession(sessionName: string): ListedSession {
  return {
    sessionName,
    kind: "terminal",
    index: 1,
    lastActivityAt: OLD_ACTIVITY_AT,
  };
}
