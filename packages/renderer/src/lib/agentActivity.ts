import type {
  AgentActivityState,
  AnyEventRecord,
  ManagedAgent,
  PresenceState,
} from "@f-mark/shared";

const NO_LOOSE_STRING_VALUES = {
  running: "running",
  notified: "notified",
  accessPending: "access-pending",
  online: "online",
  stale: "stale",
  launching: "launching",
  turnEnd: "turn-end",
  accessResponse: "access-response",
  removed: "removed",
  us: "us",
} as const;

export function managedActivityIsWorking(
  state: AgentActivityState | undefined,
): boolean {
  return state === NO_LOOSE_STRING_VALUES.running || state === NO_LOOSE_STRING_VALUES.accessPending;
}

export function presenceLooksRunnable(
  state: PresenceState | undefined,
): boolean {
  return state === NO_LOOSE_STRING_VALUES.online || state === NO_LOOSE_STRING_VALUES.stale || state === NO_LOOSE_STRING_VALUES.launching;
}

export function agentHasOpenTurnActivity(
  events: readonly AnyEventRecord[],
  participantId: string,
): boolean {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]!;
    if (event.kind === NO_LOOSE_STRING_VALUES.turnEnd) return false;
    if (event.participant_id === participantId) return true;
  }
  return false;
}

export function agentHasClosedCurrentTurn(
  events: readonly AnyEventRecord[],
  participantId: string,
): boolean {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]!;
    if (event.participant_id === participantId) {
      return event.kind === NO_LOOSE_STRING_VALUES.turnEnd;
    }
    if (event.participant_id.startsWith(NO_LOOSE_STRING_VALUES.us)) return false;
  }
  return false;
}

export function agentHasPendingUserTurn(
  events: readonly AnyEventRecord[],
  participantId: string,
): boolean {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]!;
    if (event.participant_id === participantId) return false;
    if (
      event.participant_id.startsWith(NO_LOOSE_STRING_VALUES.us) &&
      event.kind !== NO_LOOSE_STRING_VALUES.accessResponse
    ) {
      return true;
    }
  }
  return false;
}

export function agentLooksActive(input: {
  managedAgent: ManagedAgent | undefined;
  presenceState: PresenceState | undefined;
  hasPendingAccess: boolean;
  hasOpenTurnActivity: boolean;
  hasClosedCurrentTurn?: boolean;
  hasPendingUserTurn?: boolean;
}): boolean {
  if (input.managedAgent?.membership_state === NO_LOOSE_STRING_VALUES.removed) return false;
  if (input.managedAgent?.controllable === false) return false;
  if (input.hasPendingAccess) return true;
  if (input.hasClosedCurrentTurn === true) return false;
  if (managedActivityIsWorking(input.managedAgent?.activity_state)) return true;
  if (
    input.hasPendingUserTurn === true &&
    input.managedAgent?.activity_state === NO_LOOSE_STRING_VALUES.notified
  ) {
    return true;
  }
  if (input.hasOpenTurnActivity) return true;

  /* Backward compatibility: older kernels and just-spawned WS messages may not
     carry activity_state yet. Once the field is known, states like "notified"
     are deliberately not treated as running. */
  if (input.managedAgent?.activity_state === undefined) {
    return presenceLooksRunnable(input.presenceState);
  }
  return false;
}
