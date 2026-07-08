import { useCallback } from "react";
import type { SpawnResponse } from "@f-mark/shared";
import type { UseAgentSpawnActionsInput } from "./useAgentSpawnActionsTypes.js";
import { useConfigureRuntimeAction } from "./useConfigureRuntimeAction.js";
import { useSpawnCompleteAction } from "./useSpawnCompleteAction.js";
import { useSpawnRuntimeAction } from "./useSpawnRuntimeAction.js";

const NO_LOOSE_STRING_VALUES = {
  runtimes: "runtimes",
} as const;

export interface AgentSpawnActions {
  onSpawnRuntime(runtimeId: string): void;
  onConfigureRuntime(runtimeId: string): void;
  onManageRuntimes(): void;
  onSpawnComplete(resp: SpawnResponse, name: string, color: string): void;
}

export function useAgentSpawnActions({
  apiClient,
  restClient,
  currentSessionId,
  managedAgentsDisabledReason,
  setManagedAgentsDisabledReason,
  addManagedAgent,
  upsertParticipant,
  setPresence,
  openSettings,
  spawnRootScope,
  setConnectingAgents,
  setIntegrationSetupFor,
  setSpawnError,
  accessModeForRuntime,
  modelForRuntime,
  effortForRuntime,
}: UseAgentSpawnActionsInput): AgentSpawnActions {
  const onSpawnComplete = useSpawnCompleteAction({
    restClient,
    addManagedAgent,
    upsertParticipant,
    setPresence,
  });
  const onSpawnRuntime = useSpawnRuntimeAction({
    apiClient,
    currentSessionId,
    managedAgentsDisabledReason,
    setManagedAgentsDisabledReason,
    spawnRootScope,
    setConnectingAgents,
    setIntegrationSetupFor,
    setSpawnError,
    accessModeForRuntime,
    modelForRuntime,
    effortForRuntime,
    onSpawnComplete,
  });
  const onConfigureRuntime = useConfigureRuntimeAction({
    apiClient,
    managedAgentsDisabledReason,
    setManagedAgentsDisabledReason,
    spawnRootScope,
    setIntegrationSetupFor,
    setSpawnError,
    modelForRuntime,
    effortForRuntime,
  });
  const onManageRuntimes = useCallback(() => {
    openSettings(NO_LOOSE_STRING_VALUES.runtimes);
  }, [openSettings]);

  return {
    onSpawnRuntime,
    onConfigureRuntime,
    onManageRuntimes,
    onSpawnComplete,
  };
}
