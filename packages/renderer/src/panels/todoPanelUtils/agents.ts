import type { Participant } from "@f-mark/shared";

const NO_LOOSE_STRING_VALUES = {
  agent: "agent",
} as const;

export function getAgentIds(
  participants: Record<string, Participant>,
): string[] {
  return Object.entries(participants)
    .filter(([, participant]) => participant.kind === NO_LOOSE_STRING_VALUES.agent)
    .map(([id]) => id);
}

export function getSessionAgentIds(
  participants: Record<string, Participant>,
  sessionId: string | null,
): string[] {
  if (sessionId === null) return [];
  return Object.entries(participants)
    .filter(
      ([, participant]) =>
        participant.kind === NO_LOOSE_STRING_VALUES.agent &&
        participant.active_session === sessionId,
    )
    .map(([id]) => id);
}

export function pickRandomAgentId(agentIds: string[]): string | undefined {
  if (agentIds.length === 0) return undefined;
  const idx = Math.floor(Math.random() * agentIds.length);
  return agentIds[idx];
}
