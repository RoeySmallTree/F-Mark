import { useCurrentSessionRootScopeBinding } from "../../hooks/useCurrentSessionRootScope.js";
import { useStore } from "../../state/store.js";

function useSessionStoreBindings() {
  const currentSessionId = useStore((state) => state.currentSessionId);
  const { scope: currentScope, scopeKey } = useCurrentSessionRootScopeBinding(currentSessionId);
  const participants = useStore((state) => state.participants);
  const events = useStore((state) => state.events);
  const currentUserId = useStore((state) => state.currentUserId);
  const openSettings = useStore((state) => state.openSettings);

  return {
    currentSessionId,
    currentScope,
    scopeKey,
    participants,
    events,
    currentUserId,
    openSettings,
  };
}

function useManagedStoreBindings() {
  const token = useStore((state) => state.token);
  const managedAgents = useStore((state) => state.managedAgents);
  const managedTerminals = useStore((state) => state.managedTerminals);
  const managedAgentsDisabledReason = useStore((state) => state.managedAgentsDisabledReason);
  const setManagedAgentsDisabledReason = useStore((state) => state.setManagedAgentsDisabledReason);
  const presence = useStore((state) => state.presence);

  return {
    token,
    managedAgents,
    managedTerminals,
    managedAgentsDisabledReason,
    setManagedAgentsDisabledReason,
    presence,
  };
}

function useAgentActionStoreBindings() {
  const addManagedTerminal = useStore((state) => state.addManagedTerminal);
  const addManagedAgent = useStore((state) => state.addManagedAgent);
  const upsertParticipant = useStore((state) => state.upsertParticipant);
  const setPresence = useStore((state) => state.setPresence);
  const removeManagedAgent = useStore((state) => state.removeManagedAgent);
  const removePresence = useStore((state) => state.removePresence);

  return {
    addManagedTerminal,
    addManagedAgent,
    upsertParticipant,
    setPresence,
    removeManagedAgent,
    removePresence,
  };
}

export function useParticipantStripStore() {
  return {
    ...useSessionStoreBindings(),
    ...useManagedStoreBindings(),
    ...useAgentActionStoreBindings(),
  };
}
