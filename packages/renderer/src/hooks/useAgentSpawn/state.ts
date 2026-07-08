import type { PresenceState, SpawnResponse } from "@f-mark/shared";
import type { ConnectingAgent } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  installed: "installed",
  stale: "stale",
  notRequired: "not_required",
  missing: "missing",
  hookNotInstalled: "hook-not-installed",
  launching: "launching",
} as const;

export function upsertConnectingAgent(
  agents: ConnectingAgent[],
  nextAgent: ConnectingAgent,
): ConnectingAgent[] {
  return [
    ...agents.filter((agent) => agent.participantId !== nextAgent.participantId),
    nextAgent,
  ];
}

export function removeConnectingAgent(
  agents: ConnectingAgent[],
  participantId: string | null,
): ConnectingAgent[] {
  if (participantId === null) return agents;
  return agents.filter((agent) => agent.participantId !== participantId);
}

export function spawnPresenceState(resp: SpawnResponse): PresenceState {
  if (resp.hooks_status === NO_LOOSE_STRING_VALUES.installed) return NO_LOOSE_STRING_VALUES.stale;
  if (resp.hooks_status === NO_LOOSE_STRING_VALUES.notRequired) return NO_LOOSE_STRING_VALUES.stale;
  if (resp.hooks_status === NO_LOOSE_STRING_VALUES.missing) return NO_LOOSE_STRING_VALUES.hookNotInstalled;
  return NO_LOOSE_STRING_VALUES.launching;
}
