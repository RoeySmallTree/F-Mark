import type {
  AnyEventRecord,
  ManagedAgent,
  Participant,
} from "@f-mark/shared";
import { pendingAccessCountForParticipant } from "../../cards/AccessRequestCard.js";
import type { AgentPresence } from "../../state/presence.js";
import type { AgentChipModel, UserParticipant } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  online: "online",
  stale: "stale",
  launching: "launching",
  hookNotInstalled: "hook-not-installed",
  paneDead: "pane-dead",
  agent: "agent",
  user: "user",
} as const;

interface BuildAgentChipsInput {
  participants: Record<string, Participant>;
  managedAgents: ManagedAgent[];
  presence: Record<string, AgentPresence>;
  currentSessionId: string | null;
  events: AnyEventRecord[];
  activeAgentIds?: ReadonlySet<string>;
}

function agentPresenceOrder(
  participantId: string,
  presence: Record<string, AgentPresence>,
  activeAgentIds?: ReadonlySet<string>,
): number {
  if (activeAgentIds?.has(participantId)) return -1;
  const state = presence[participantId]?.state;
  if (state === NO_LOOSE_STRING_VALUES.online) return 0;
  if (state === NO_LOOSE_STRING_VALUES.stale || state === NO_LOOSE_STRING_VALUES.launching) return 1;
  if (state === NO_LOOSE_STRING_VALUES.hookNotInstalled) return 2;
  if (state === NO_LOOSE_STRING_VALUES.paneDead) return 3;
  return 4;
}

export function buildAgentChips({
  participants,
  managedAgents,
  presence,
  currentSessionId,
  events,
  activeAgentIds,
}: BuildAgentChipsInput): AgentChipModel[] {
  const managedById = new Map<string, ManagedAgent>();
  for (const agent of managedAgents) managedById.set(agent.participant_id, agent);
  const entries = Object.entries(participants)
    .filter(([, participant]) => (
      participant.kind === NO_LOOSE_STRING_VALUES.agent &&
      currentSessionId !== null &&
      participant.active_session === currentSessionId
    ))
    .map(([id, participant]) => {
      const managed = managedById.get(id);
      return {
        participant_id: id,
        name: participant.name,
        runtime_id: managed?.runtime_id ?? participant.runtime_id ?? null,
        tmux_session: managed?.tmux_session ?? null,
        isManaged: managed !== undefined,
        pendingAccessCount: pendingAccessCountForParticipant(id, events),
        runtime_state: managed?.runtime_state,
        access_mode: managed?.access_mode,
        activity_state: managed?.activity_state,
        controllable: managed?.controllable,
        pane_lifecycle: managed?.pane_lifecycle,
        membership_state: managed?.membership_state,
      };
    });

  return entries.sort((a, b) => {
    const aOrder = agentPresenceOrder(a.participant_id, presence, activeAgentIds);
    const bOrder = agentPresenceOrder(b.participant_id, presence, activeAgentIds);
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.name.localeCompare(b.name);
  });
}

function isUserParticipant(
  participant: Participant & { id: string },
): participant is UserParticipant {
  return participant.kind === NO_LOOSE_STRING_VALUES.user;
}

export function buildUserParticipants(
  participants: Record<string, Participant>,
): UserParticipant[] {
  return Object.entries(participants)
    .map(([id, participant]) => ({ id, ...participant }))
    .filter(isUserParticipant)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function agentFlipKey(
  agents: AgentChipModel[],
  activeAgentIds?: ReadonlySet<string>,
): string {
  return agents
    .map((agent) => `${agent.participant_id}:${activeAgentIds?.has(agent.participant_id) ? 1 : 0}`)
    .join("|");
}
