import type { ManagedAgentWsMessage, Participant } from "@f-mark/shared";
import type { PresenceSlice } from "./presence.js";

const NO_LOOSE_STRING_VALUES = {
  connected: "connected",
  agent: "agent",
} as const;

export interface ManagedAgentWsDispatchState extends PresenceSlice {
  participants: Record<string, Participant>;
  upsertParticipant(id: string, participant: Participant): void;
}


export function dispatchManagedAgentWsMessageToState(
  state: ManagedAgentWsDispatchState,
  msg: ManagedAgentWsMessage,
): void {
  switch (msg.type) {
    case "presence":
      state.setPresence(msg.participant_id, {
        state: msg.state,
        last_hook_at: msg.last_hook_at,
      });
      return;
    case "managed-agent.spawned":
      state.addManagedAgent({
        participant_id: msg.participant_id,
        tmux_session: msg.tmux_session,
        runtime_id: msg.runtime_id,
        active_session: msg.active_session,
      });
      upsertSpawnedAgentParticipant(state, msg.participant_id, {
        runtime_id: msg.runtime_id,
        active_session: msg.active_session,
      });
      state.bumpManagedAgentLiveRevision();
      return;
    case "managed-agent.killed":
      state.removeManagedAgent(msg.participant_id);
      state.removePresence(msg.participant_id);
      clearAgentParticipantSession(state, msg.participant_id);
      state.bumpManagedAgentLiveRevision();
      return;
    case "managed-agent.updated":
      state.addManagedAgent({
        participant_id: msg.agent.participant_id,
        display_name: msg.agent.display_name,
        tmux_session: msg.agent.tmux_session,
        runtime_id: msg.agent.runtime_id,
        active_session: msg.agent.active_session,
        runtime_session: msg.agent.runtime_session,
        alive: msg.agent.connection_state === NO_LOOSE_STRING_VALUES.connected,
        activity_state: msg.agent.activity_state,
        runtime_state: msg.agent.runtime_state,
        access_mode: msg.agent.access.mode,
      });
      upsertUpdatedAgentParticipant(state, msg.agent.participant_id, {
        runtime_id: msg.agent.runtime_id,
        active_session: msg.agent.active_session,
      });
      state.bumpManagedAgentLiveRevision();
      return;
    case "managed-agent.terminal-spawned":
      state.addManagedTerminal({
        tmux_session: msg.tmux_session,
        label: msg.label,
        index: msg.index,
      });
      return;
    case "managed-agent.terminal-closed":
      state.removeManagedTerminal(msg.tmux_session);
      return;
    case "env-probe.updated":
      state.setEnvProbe(msg.result);
      return;
  }
}

function clearAgentParticipantSession(
  state: ManagedAgentWsDispatchState,
  participantId: string,
): void {
  const participant = state.participants[participantId];
  if (participant === undefined || participant.kind !== NO_LOOSE_STRING_VALUES.agent) return;
  state.upsertParticipant(participantId, {
    ...participant,
    active_session: null,
  });
}

function upsertSpawnedAgentParticipant(
  state: ManagedAgentWsDispatchState,
  participantId: string,
  patch: { runtime_id: string; active_session: string | null },
): void {
  const participant = state.participants[participantId];
  if (participant === undefined || participant.kind !== NO_LOOSE_STRING_VALUES.agent) return;
  state.upsertParticipant(participantId, {
    ...participant,
    runtime_id: patch.runtime_id,
    active_session: patch.active_session,
  });
}

function upsertUpdatedAgentParticipant(
  state: ManagedAgentWsDispatchState,
  participantId: string,
  patch: { runtime_id: string | null; active_session: string | null },
): void {
  const participant = state.participants[participantId];
  if (participant === undefined || participant.kind !== NO_LOOSE_STRING_VALUES.agent) return;
  state.upsertParticipant(participantId, {
    ...participant,
    runtime_id: patch.runtime_id ?? participant.runtime_id,
    active_session: patch.active_session,
  });
}
