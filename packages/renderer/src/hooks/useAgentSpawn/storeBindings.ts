import { useMemo } from "react";
import type {
  EnvProbeResult,
  ManagedAgent,
  Participant,
} from "@f-mark/shared";
import { rootScopeForSession, type RootScope } from "../../api/rootScope.js";
import type { AgentPresence } from "../../state/presence.js";
import { findSessionForSelection, useStore } from "../../state/store.js";
import type { SettingsSectionKey } from "../../state/storeTypes.js";

export interface AgentSpawnStoreBindings {
  token: string | null;
  envProbe: EnvProbeResult | null;
  currentSessionId: string | null;
  managedAgentsDisabledReason: string | null;
  setManagedAgentsDisabledReason(reason: string | null): void;
  addManagedAgent(agent: ManagedAgent): void;
  upsertParticipant(id: string, participant: Participant): void;
  setPresence(participantId: string, presence: AgentPresence): void;
  openSettings(section?: SettingsSectionKey): void;
  spawnRootScope: RootScope | null;
}

export function useAgentSpawnStoreBindings(): AgentSpawnStoreBindings {
  const token = useStore((s) => s.token);
  const envProbe = useStore((s) => s.envProbe);
  const sessions = useStore((s) => s.sessions);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const selectedPathId = useStore((s) => s.selectedPathId);
  const selectedPath = useStore((s) => s.selectedPath);
  const managedAgentsDisabledReason = useStore(
    (s) => s.managedAgentsDisabledReason,
  );
  const setManagedAgentsDisabledReason = useStore(
    (s) => s.setManagedAgentsDisabledReason,
  );
  const addManagedAgent = useStore((s) => s.addManagedAgent);
  const upsertParticipant = useStore((s) => s.upsertParticipant);
  const setPresence = useStore((s) => s.setPresence);
  const openSettings = useStore((s) => s.openSettings);

  const spawnRootScope = useMemo(() => {
    const session = findSessionForSelection(
      sessions,
      currentSessionId,
      selectedPathId,
      selectedPath,
    );
    return rootScopeForSession(session, selectedPathId, selectedPath);
  }, [currentSessionId, selectedPath, selectedPathId, sessions]);

  return {
    token,
    envProbe,
    currentSessionId,
    managedAgentsDisabledReason,
    setManagedAgentsDisabledReason,
    addManagedAgent,
    upsertParticipant,
    setPresence,
    openSettings,
    spawnRootScope,
  };
}
