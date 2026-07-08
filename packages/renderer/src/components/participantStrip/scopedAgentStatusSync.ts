import { useEffect } from "react";
import type {
  AgentStatusRow,
  ManagedAgent,
  PresenceState,
} from "@f-mark/shared";
import type { ManagedAgentsClient } from "../../api/managedAgents.js";
import type { AgentPresence } from "../../state/presence.js";
import { useStore } from "../../state/store.js";

const NO_LOOSE_STRING_VALUES = {
  connected: "connected",
  online: "online",
  launching: "launching",
  offline: "offline",
  agent: "agent",
  pathPrefix: "path_id:",
  rootPrefix: "root:",
} as const;

interface UseScopedAgentStatusSyncParams {
  api: ManagedAgentsClient;
  currentSessionId: string | null;
  scopeKey: string;
}

export function managedAgentFromStatusRow(row: AgentStatusRow): ManagedAgent {
  return {
    participant_id: row.participant_id,
    display_name: row.display_name,
    tmux_session: row.tmux_session,
    runtime_id: row.runtime_id,
    active_session: row.active_session,
    membership_session_id: row.membership_session_id,
    membership_state: row.membership_state,
    pane_lifecycle: row.pane_lifecycle,
    controllable: row.controllable,
    removed_at: row.removed_at,
    removed_reason: row.removed_reason,
    runtime_session: row.runtime_session,
    alive: row.connection_state === NO_LOOSE_STRING_VALUES.connected,
    activity_state: row.activity_state,
    runtime_state: row.runtime_state,
    access_mode: row.access.mode,
  };
}

export function presenceFromStatusRow(row: AgentStatusRow): AgentPresence {
  return {
    state: presenceStateFromConnection(row.connection_state),
    last_hook_at: null,
  };
}

function presenceStateFromConnection(
  connectionState: AgentStatusRow["connection_state"],
): PresenceState {
  if (connectionState === NO_LOOSE_STRING_VALUES.connected) return NO_LOOSE_STRING_VALUES.online;
  if (connectionState === NO_LOOSE_STRING_VALUES.launching) return NO_LOOSE_STRING_VALUES.launching;
  return NO_LOOSE_STRING_VALUES.offline;
}

function resolveScope(scopeKey: string) {
  if (scopeKey.startsWith(NO_LOOSE_STRING_VALUES.pathPrefix)) {
    return { pathId: scopeKey.slice(NO_LOOSE_STRING_VALUES.pathPrefix.length) };
  }
  if (scopeKey.startsWith(NO_LOOSE_STRING_VALUES.rootPrefix)) {
    return { root: scopeKey.slice(NO_LOOSE_STRING_VALUES.rootPrefix.length) };
  }
  return null;
}

export function useScopedAgentStatusSync({
  api,
  currentSessionId,
  scopeKey,
}: UseScopedAgentStatusSyncParams): void {
  useEffect(() => {
    if (currentSessionId === null || scopeKey.length === 0) return;
    const scope = resolveScope(scopeKey);
    let cancelled = false;
    void (async () => {
      try {
        const status = await api.status(currentSessionId, scope);
        if (cancelled) return;
        const {
          addManagedAgent,
          removeManagedAgent,
          setPresence,
          removePresence,
          upsertParticipant,
          participants,
        } = useStore.getState();
        for (const row of status.agents ?? []) {
          addManagedAgent(managedAgentFromStatusRow(row));
          setPresence(row.participant_id, presenceFromStatusRow(row));
        }
        for (const row of status.removed_agents ?? []) {
          removeManagedAgent(row.participant_id);
          removePresence(row.participant_id);
          const existing = participants[row.participant_id];
          if (existing !== undefined && existing.kind === NO_LOOSE_STRING_VALUES.agent) {
            upsertParticipant(row.participant_id, {
              ...existing,
              active_session: null,
            });
          }
        }
      } catch (err) {
        if (!cancelled) console.warn("sync scoped agent status failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, currentSessionId, scopeKey]);
}
