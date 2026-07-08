import {
  AGENT_CONNECTION_STATES,
  PARTICIPANT_KINDS,
  type AgentStatusRow,
  type Participant,
} from "@f-mark/shared";
import type { MentionRow } from "./types.js";

const mentionStatusLabels = {
  paused: "Paused",
  connected: "Connected",
  detached: "Detached",
  launching: "Launching",
  offline: "Offline",
} as const;

interface BuildMentionRowsArgs {
  agents: AgentStatusRow[] | null;
  participants: Record<string, Participant>;
  sessionId: string | null;
}

function mentionToken(displayName: string): string {
  return `@${displayName}`;
}

function rowFromStatus(agent: AgentStatusRow): MentionRow {
  return {
    participant_id: agent.participant_id,
    display_name: agent.display_name,
    token: mentionToken(agent.display_name),
    paused: agent.paused,
    connectionState: agent.connection_state,
    managed: agent.managed,
  };
}

function rowFromParticipant(
  id: string,
  participant: Participant,
): MentionRow {
  return {
    participant_id: id,
    display_name: participant.name,
    token: mentionToken(participant.name),
    paused: false,
    connectionState: AGENT_CONNECTION_STATES.connected,
    managed: false,
  };
}

export function rowStatus(row: MentionRow): string {
  if (row.paused) return mentionStatusLabels.paused;
  if (row.connectionState === AGENT_CONNECTION_STATES.connected) {
    return mentionStatusLabels.connected;
  }
  if (row.connectionState === AGENT_CONNECTION_STATES.detached) {
    return mentionStatusLabels.detached;
  }
  if (row.connectionState === AGENT_CONNECTION_STATES.launching) {
    return mentionStatusLabels.launching;
  }
  return mentionStatusLabels.offline;
}

export function isRowSelectable(row: MentionRow): boolean {
  return !row.paused && row.connectionState === AGENT_CONNECTION_STATES.connected;
}

export function canReconnectRow(row: MentionRow): boolean {
  return (
    !row.paused &&
    (row.connectionState === AGENT_CONNECTION_STATES.detached ||
      row.connectionState === AGENT_CONNECTION_STATES.offline)
  );
}

export function buildMentionRows({
  agents,
  participants,
  sessionId,
}: BuildMentionRowsArgs): MentionRow[] {
  const byId = new Map<string, MentionRow>();
  for (const agent of agents ?? []) {
    if (agent.active_session !== sessionId || !agent.managed) continue;
    byId.set(agent.participant_id, rowFromStatus(agent));
  }
  for (const [id, participant] of Object.entries(participants)) {
    if (
      participant.kind !== PARTICIPANT_KINDS.agent ||
      participant.active_session !== sessionId ||
      byId.has(id)
    ) {
      continue;
    }
    byId.set(id, rowFromParticipant(id, participant));
  }
  return [...byId.values()].sort((a, b) =>
    a.display_name.localeCompare(b.display_name),
  );
}
