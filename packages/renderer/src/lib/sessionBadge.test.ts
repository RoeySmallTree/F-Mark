import { describe, expect, it } from "vitest";
import {
  computeSessionBadge,
  type SessionBadgeAgentFacts,
  type SessionBadgeInput,
} from "./sessionBadge.js";

function agent(
  overrides: Partial<SessionBadgeAgentFacts> = {},
): SessionBadgeAgentFacts {
  return {
    alive: true,
    activityState: undefined,
    pendingAccessCount: 0,
    hasOpenTurnActivity: false,
    hasPendingUserTurn: false,
    ...overrides,
  };
}

function input(overrides: Partial<SessionBadgeInput> = {}): SessionBadgeInput {
  return {
    isCurrent: false,
    currentTurnIsAgent: false,
    agents: [],
    hasUnseenEvents: false,
    ...overrides,
  };
}

describe("computeSessionBadge", () => {
  it("resolves to 'done read' with no agents and nothing unseen", () => {
    expect(computeSessionBadge(input())).toBe("done read");
  });

  it("resolves to 'done read' for a dead/idle agent", () => {
    expect(
      computeSessionBadge(
        input({ agents: [agent({ alive: false, activityState: "idle" })] }),
      ),
    ).toBe("done read");
  });

  describe("awaiting input", () => {
    it("fires on activity_state access-pending in any session", () => {
      expect(
        computeSessionBadge(
          input({ agents: [agent({ activityState: "access-pending" })] }),
        ),
      ).toBe("awaiting input");
    });

    it("fires on a pending access request in the current session", () => {
      expect(
        computeSessionBadge(
          input({
            isCurrent: true,
            agents: [agent({ activityState: "idle", pendingAccessCount: 1 })],
          }),
        ),
      ).toBe("awaiting input");
    });

    it("ignores event-log pending access for a non-current session", () => {
      // pendingAccessCount only carries meaning for the loaded session, so a
      // background session relies on activity_state alone.
      expect(
        computeSessionBadge(
          input({
            isCurrent: false,
            agents: [agent({ activityState: "idle", pendingAccessCount: 1 })],
          }),
        ),
      ).toBe("done read");
    });

    it("outranks working when one agent is blocked and another is running", () => {
      expect(
        computeSessionBadge(
          input({
            agents: [
              agent({ activityState: "running" }),
              agent({ activityState: "access-pending" }),
            ],
          }),
        ),
      ).toBe("awaiting input");
    });
  });

  describe("working", () => {
    it("fires on an open turn in the current session", () => {
      expect(
        computeSessionBadge(
          input({
            isCurrent: true,
            agents: [agent({ activityState: "idle", hasOpenTurnActivity: true })],
          }),
        ),
      ).toBe("working");
    });

    it("fires when the live agent turn is running in the current session", () => {
      expect(
        computeSessionBadge(
          input({
            isCurrent: true,
            currentTurnIsAgent: true,
            agents: [agent({ activityState: "running" })],
          }),
        ),
      ).toBe("working");
    });

    it("fires when a notified agent has an unanswered current-session user turn", () => {
      expect(
        computeSessionBadge(
          input({
            isCurrent: true,
            agents: [
              agent({
                activityState: "notified",
                hasPendingUserTurn: true,
              }),
            ],
          }),
        ),
      ).toBe("working");
    });

    it("fires on an alive running agent in a background session", () => {
      expect(
        computeSessionBadge(
          input({
            isCurrent: false,
            agents: [agent({ alive: true, activityState: "running" })],
          }),
        ),
      ).toBe("working");
    });

    it("treats an alive agent with no activity_state as working (back-compat)", () => {
      expect(
        computeSessionBadge(
          input({ agents: [agent({ alive: true, activityState: undefined })] }),
        ),
      ).toBe("working");
    });

    it("does NOT mark a current-session running agent working unless it holds the live turn", () => {
      // Mirrors the original gating: in the viewed session a stale running flag
      // without the live turn (or an open turn) does not read as working.
      expect(
        computeSessionBadge(
          input({
            isCurrent: true,
            currentTurnIsAgent: false,
            // alive:false so the back-compat / background paths don't apply
            agents: [agent({ alive: false, activityState: "running" })],
          }),
        ),
      ).toBe("done read");
    });
  });

  describe("done unread vs done read", () => {
    it("resolves to 'done unread' when there are unseen events and no active agent", () => {
      expect(
        computeSessionBadge(
          input({
            isCurrent: true,
            hasUnseenEvents: true,
            agents: [agent({ alive: false, activityState: "turn-ended" })],
          }),
        ),
      ).toBe("done unread");
    });

    it("working outranks unseen events", () => {
      expect(
        computeSessionBadge(
          input({
            isCurrent: true,
            currentTurnIsAgent: true,
            hasUnseenEvents: true,
            agents: [agent({ activityState: "running" })],
          }),
        ),
      ).toBe("working");
    });

    it("resolves to 'done read' when finished and seen", () => {
      expect(
        computeSessionBadge(
          input({
            isCurrent: true,
            hasUnseenEvents: false,
            agents: [agent({ alive: false, activityState: "turn-ended" })],
          }),
        ),
      ).toBe("done read");
    });
  });
});
