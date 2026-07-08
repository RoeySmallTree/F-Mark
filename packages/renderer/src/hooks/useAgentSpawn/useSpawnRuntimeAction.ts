import { useCallback, useRef } from "react";
import type { AgentSpawnStoreBindings } from "./storeBindings.js";
import {
  runSpawnRuntimeJob,
  type SpawnRuntimeJobInput,
} from "./spawnRuntimeJob.js";

interface UseSpawnRuntimeActionInput
  extends Pick<
    AgentSpawnStoreBindings,
    "managedAgentsDisabledReason"
  >,
    SpawnRuntimeJobInput {}

export function useSpawnRuntimeAction({
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
}: UseSpawnRuntimeActionInput): (runtimeId: string) => void {
  /* Synchronous in-flight guard: a double-click fires two handler calls
     before React re-renders, so state-derived disabling can't catch the
     second one. The ref dedupes per runtime+session until the job settles. */
  const spawnsInFlight = useRef(new Set<string>());
  return useCallback(
    (runtimeId: string) => {
      const inFlightKey = `${runtimeId}::${currentSessionId ?? ""}`;
      if (spawnsInFlight.current.has(inFlightKey)) return;
      setSpawnError(null);
      setIntegrationSetupFor(null);
      if (managedAgentsDisabledReason !== null) {
        setSpawnError(managedAgentsDisabledReason);
        return;
      }
      spawnsInFlight.current.add(inFlightKey);
      void runSpawnRuntimeJob(runtimeId, {
        apiClient,
        currentSessionId,
        setManagedAgentsDisabledReason,
        spawnRootScope,
        setConnectingAgents,
        setIntegrationSetupFor,
        setSpawnError,
        accessModeForRuntime,
        modelForRuntime,
        effortForRuntime,
        onSpawnComplete,
      }).finally(() => {
        spawnsInFlight.current.delete(inFlightKey);
      });
    },
    [
      apiClient,
      accessModeForRuntime,
      currentSessionId,
      effortForRuntime,
      managedAgentsDisabledReason,
      modelForRuntime,
      onSpawnComplete,
      setConnectingAgents,
      setIntegrationSetupFor,
      setManagedAgentsDisabledReason,
      setSpawnError,
      spawnRootScope,
    ],
  );
}
