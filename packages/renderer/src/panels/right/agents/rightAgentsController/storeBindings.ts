import { useStore } from "../../../../state/store.js";

export function useRightAgentsStoreBindings() {
  const token = useStore((s) => s.token);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const managedAgents = useStore((s) => s.managedAgents);
  const events = useStore((s) => s.events);
  const participants = useStore((s) => s.participants);
  const upsertParticipant = useStore((s) => s.upsertParticipant);

  return {
    token,
    currentSessionId,
    managedAgents,
    events,
    participants,
    upsertParticipant,
  };
}
