import type { AgentStatusRow, ManagedAgent, Participant } from "@f-mark/shared";
import type { AgentPresence } from "../../state/presence.js";

const NO_LOOSE_STRING_VALUES = {
  connected: "connected",
  agent: "agent",
  launching: "launching",
  offline: "offline",
} as const;

interface ReconnectedAgentStore {
  participants: Record<string, Participant>;
  addManagedAgent(agent: ManagedAgent): void;
  upsertParticipant(id: string, participant: Participant): void;
  setPresence(id: string, presence: AgentPresence): void;
}

export function applyReconnectedAgent(
  agent: AgentStatusRow,
  lastHookAt: number | null,
  store: ReconnectedAgentStore,
): void {
  store.addManagedAgent({
    participant_id: agent.participant_id,
    tmux_session: agent.tmux_session,
    runtime_id: agent.runtime_id,
    runtime_session: agent.runtime_session,
    alive: agent.connection_state === NO_LOOSE_STRING_VALUES.connected,
    activity_state: agent.activity_state,
    runtime_state: agent.runtime_state,
  });
  const existing = store.participants[agent.participant_id];
  if (existing !== undefined && existing.kind === NO_LOOSE_STRING_VALUES.agent) {
    store.upsertParticipant(agent.participant_id, {
      ...existing,
      runtime_id: agent.runtime_id ?? existing.runtime_id,
      active_session: agent.active_session,
    });
  }
  store.setPresence(agent.participant_id, {
    state: agent.connection_state === NO_LOOSE_STRING_VALUES.connected ? NO_LOOSE_STRING_VALUES.launching : NO_LOOSE_STRING_VALUES.offline,
    last_hook_at: lastHookAt,
  });
}
