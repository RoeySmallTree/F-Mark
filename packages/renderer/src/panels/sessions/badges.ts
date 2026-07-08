import type { AnyEventRecord, ManagedAgent, Participant } from "@f-mark/shared";
import { pendingAccessCountForParticipant } from "../../cards/AccessRequestCard.js";
import {
  agentHasOpenTurnActivity,
  agentHasPendingUserTurn,
} from "../../lib/agentActivity.js";
import {
  computeSessionBadge,
  type SessionBadge,
} from "../../lib/sessionBadge.js";
import { aggregate } from "../../state/aggregate.js";
import type { SessionMeta } from "../../api/client.js";

const NO_LOOSE_STRING_VALUES = {
  agent: "agent",
  ag: "ag",
} as const;

export interface SessionBadgeContext {
  activePath: string | null;
  currentSessionId: string | null;
  events: AnyEventRecord[];
  lastSeenBySession: Record<string, string>;
  managedAgents: ManagedAgent[];
  participants: Record<string, Participant>;
}

export function resolveSessionBadge(
  session: SessionMeta,
  context: SessionBadgeContext,
): SessionBadge {
  const {
    activePath,
    currentSessionId,
    events,
    lastSeenBySession,
    managedAgents,
    participants,
  } = context;
  const sessionAgentIds = Object.entries(participants)
    .filter(
      ([, participant]) =>
        participant.kind === NO_LOOSE_STRING_VALUES.agent &&
        participant.active_session === session.id,
    )
    .map(([id]) => id);
  const managedById = new Map(
    managedAgents.map((agent) => [agent.participant_id, agent]),
  );
  const isCurrent =
    session.id === currentSessionId &&
    (session.path === undefined ||
      activePath === null ||
      session.path === activePath);
  const currentTurnIsAgent =
    isCurrent && aggregate(events).currentTurnParticipantPrefix === NO_LOOSE_STRING_VALUES.ag;

  const agents = sessionAgentIds.map((id) => {
    const managed = managedById.get(id);
    return {
      alive: managed?.alive,
      activityState: managed?.activity_state,
      pendingAccessCount: isCurrent
        ? pendingAccessCountForParticipant(id, events)
        : 0,
      hasOpenTurnActivity: isCurrent
        ? agentHasOpenTurnActivity(events, id)
        : false,
      hasPendingUserTurn: isCurrent
        ? agentHasPendingUserTurn(events, id)
        : false,
    };
  });

  const lastSeen = lastSeenBySession[session.id];
  const latest = events[events.length - 1]?.filename;
  const hasUnseenEvents =
    isCurrent &&
    events.length > 0 &&
    latest !== undefined &&
    (lastSeen === undefined || latest > lastSeen);

  return computeSessionBadge({
    isCurrent,
    currentTurnIsAgent,
    agents,
    hasUnseenEvents,
  });
}
