import { describe, expect, it } from "vitest";
import type { AnyEventRecord, ManagedAgent } from "@f-mark/shared";
import {
  agentHasClosedCurrentTurn,
  agentHasOpenTurnActivity,
  agentHasPendingUserTurn,
  agentLooksActive,
  managedActivityIsWorking,
} from "./agentActivity.js";

function event(kind: AnyEventRecord["kind"], participantId: string): AnyEventRecord {
  return {
    filename: `${participantId}-${kind}.json`,
    timestamp: "2026-06-16T00:00:00.000Z",
    participant_id: participantId,
    kind,
    payload: {},
  } as AnyEventRecord;
}

function managed(activityState: ManagedAgent["activity_state"]): ManagedAgent {
  return {
    participant_id: "ag-codex",
    tmux_session: "tmux",
    runtime_id: "codex",
    alive: true,
    activity_state: activityState,
  };
}

describe("agent activity", () => {
  it("does not treat a notified online pane as active work", () => {
    expect(
      agentLooksActive({
        managedAgent: managed("notified"),
        presenceState: "online",
        hasPendingAccess: false,
        hasOpenTurnActivity: false,
      }),
    ).toBe(false);
  });

  it("keeps old kernels working when activity_state is absent", () => {
    expect(
      agentLooksActive({
        managedAgent: managed(undefined),
        presenceState: "online",
        hasPendingAccess: false,
        hasOpenTurnActivity: false,
      }),
    ).toBe(true);
  });

  it("treats running and access-pending as working", () => {
    expect(managedActivityIsWorking("running")).toBe(true);
    expect(managedActivityIsWorking("access-pending")).toBe(true);
    expect(managedActivityIsWorking("notified")).toBe(false);
  });

  it("detects agent output after the latest turn boundary", () => {
    expect(
      agentHasOpenTurnActivity(
        [
          event("prose", "us-1"),
          event("turn-end", "us-1"),
          event("tool-use", "ag-codex"),
        ],
        "ag-codex",
      ),
    ).toBe(true);
  });

  it("does not count a wake with no agent output as open turn activity", () => {
    expect(
      agentHasOpenTurnActivity(
        [event("prose", "us-1"), event("turn-end", "us-1")],
        "ag-codex",
      ),
    ).toBe(false);
  });

  it("detects a user turn waiting for a notified agent", () => {
    expect(
      agentHasPendingUserTurn(
        [event("prose", "us-1"), event("turn-end", "us-1")],
        "ag-codex",
      ),
    ).toBe(true);
  });

  it("clears pending user turn after that agent produces an event", () => {
    expect(
      agentHasPendingUserTurn(
        [
          event("prose", "us-1"),
          event("turn-end", "us-1"),
          event("prose", "ag-codex"),
        ],
        "ag-codex",
      ),
    ).toBe(false);
  });

  it("stops counting after the agent closes its turn", () => {
    expect(
      agentHasOpenTurnActivity(
        [
          event("turn-end", "us-1"),
          event("prose", "ag-codex"),
          event("turn-end", "ag-codex"),
        ],
        "ag-codex",
      ),
    ).toBe(false);
  });

  it("treats an agent turn-end as closed only until later user activity", () => {
    expect(
      agentHasClosedCurrentTurn(
        [
          event("turn-end", "us-1"),
          event("prose", "ag-codex"),
          event("turn-end", "ag-codex"),
        ],
        "ag-codex",
      ),
    ).toBe(true);
    expect(
      agentHasClosedCurrentTurn(
        [
          event("prose", "ag-codex"),
          event("turn-end", "ag-codex"),
          event("prose", "us-1"),
          event("turn-end", "us-1"),
        ],
        "ag-codex",
      ),
    ).toBe(false);
  });

  it("treats notified as active only for an unanswered user turn", () => {
    expect(
      agentLooksActive({
        managedAgent: managed("notified"),
        presenceState: "online",
        hasPendingAccess: false,
        hasOpenTurnActivity: false,
        hasPendingUserTurn: true,
      }),
    ).toBe(true);
  });

  it("does not keep stale managed running state active after the agent's own turn-end", () => {
    expect(
      agentLooksActive({
        managedAgent: managed("running"),
        presenceState: "online",
        hasPendingAccess: false,
        hasOpenTurnActivity: false,
        hasClosedCurrentTurn: true,
      }),
    ).toBe(false);
  });
});
