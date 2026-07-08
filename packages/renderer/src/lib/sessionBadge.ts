import type { AgentActivityState } from "@f-mark/shared";

const NO_LOOSE_STRING_VALUES = {
  accessPending: "access-pending",
  notified: "notified",
  running: "running",
  working: "working",
} as const;

/**
 * The run-state a session row resolves to. Rendered as a status beacon (a
 * leading glyph carrying colour + motion), never as literal text.
 */
export type SessionBadge =
  | "working"
  | "awaiting input"
  | "done unread"
  | "done read";

/** Per-agent facts for one agent bound to the session being resolved. */
export interface SessionBadgeAgentFacts {
  /** managed-agent `alive` flag; undefined when there is no managed record. */
  alive: boolean | undefined;
  /** managed-agent `activity_state`; undefined for legacy / just-spawned. */
  activityState: AgentActivityState | undefined;
  /** open access requests for this agent in the CURRENT session's event log
   *  (0 for non-current sessions, whose event logs are not loaded). */
  pendingAccessCount: number;
  /** this agent has posted since the last turn-end in the CURRENT session
   *  (false for non-current sessions). */
  hasOpenTurnActivity: boolean;
  /** the CURRENT session has user activity after this agent's latest event. */
  hasPendingUserTurn: boolean;
}

export interface SessionBadgeInput {
  /** the row is the session currently open in the viewer. */
  isCurrent: boolean;
  /** isCurrent AND the live turn belongs to an agent. */
  currentTurnIsAgent: boolean;
  /** run facts for every agent bound to this session. */
  agents: readonly SessionBadgeAgentFacts[];
  /** isCurrent AND the latest event is newer than the last-seen marker. */
  hasUnseenEvents: boolean;
}

/**
 * Resolve a session's run-state into a single badge, in strict precedence:
 *
 *   awaiting input  — an agent is blocked on a pending approval
 *   > working       — an agent holds an open / running turn
 *   > done unread   — finished; the viewer hasn't seen the latest events
 *   > done read     — finished and seen (the resting state)
 *
 * "awaiting input" outranks "working" on purpose: a blocked agent is making no
 * progress and needs the user, so it must read distinctly. It used to be folded
 * into "working", which hid the one state the user has to act on.
 *
 * Access-pending is detected from `activity_state` for any session, and
 * additionally from the live event log for the current one (which surfaces a
 * pending request a beat before the managed state catches up).
 */
export function computeSessionBadge(input: SessionBadgeInput): SessionBadge {
  const { isCurrent, currentTurnIsAgent, agents, hasUnseenEvents } = input;

  const awaitingInput = agents.some(
    (agent) =>
      agent.activityState === NO_LOOSE_STRING_VALUES.accessPending ||
      (isCurrent && agent.pendingAccessCount > 0),
  );
  if (awaitingInput) return "awaiting input";

  const working = agents.some((agent) => {
    if (isCurrent) {
      // The viewed session: an open turn, or the live agent turn running.
      if (agent.hasOpenTurnActivity) return true;
      if (currentTurnIsAgent && agent.activityState === NO_LOOSE_STRING_VALUES.running) return true;
      if (
        agent.hasPendingUserTurn &&
        agent.activityState === NO_LOOSE_STRING_VALUES.notified
      ) {
        return true;
      }
      return false;
    }
    // A background session: trust the managed running flag.
    return agent.alive === true && agent.activityState === NO_LOOSE_STRING_VALUES.running;
  });
  if (working) return NO_LOOSE_STRING_VALUES.working;

  // Back-compat: an alive agent that has not reported an activity_state yet
  // (older kernels, just-spawned WS messages) is treated as working, for any
  // session. Once a state is known, "notified"/"turn-ended" are not running.
  const legacyWorking = agents.some(
    (agent) => agent.alive === true && agent.activityState === undefined,
  );
  if (legacyWorking) return NO_LOOSE_STRING_VALUES.working;

  if (hasUnseenEvents) return "done unread";
  return "done read";
}
