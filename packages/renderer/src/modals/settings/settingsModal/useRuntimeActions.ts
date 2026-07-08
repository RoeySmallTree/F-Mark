import { useCallback } from "react";
import type {
  EnvProbeResult,
  RuntimeEntry,
  RuntimesFile,
} from "@f-mark/shared";
import type { ManagedAgentsClient } from "../../../api/managedAgents.js";
import type { SetRuntimeRegistry } from "./useRuntimeRegistry.js";

interface RuntimeActionsInput {
  apiClient: ManagedAgentsClient;
  setEnvProbe(envProbe: EnvProbeResult): void;
  setRuntimeRegistry: SetRuntimeRegistry;
}

export interface RuntimeActions {
  handleReprobe(): Promise<void>;
  handleAddRuntime(id: string, entry: RuntimeEntry): Promise<void>;
  handleUpdateRuntime(id: string, entry: RuntimeEntry): Promise<void>;
  handleRemoveRuntime(id: string): Promise<void>;
}

export function useRuntimeActions({
  apiClient,
  setEnvProbe,
  setRuntimeRegistry,
}: RuntimeActionsInput): RuntimeActions {
  const handleReprobe = useCallback(async () => {
    const result = await apiClient.refreshEnvProbe();
    setEnvProbe(result);
  }, [apiClient, setEnvProbe]);

  const applyRuntimeMutation = useCallback(
    async (mutate: () => Promise<RuntimesFile>) => {
      const cfg = await mutate();
      setRuntimeRegistry(cfg.runtimes);
      await refreshEnvProbeIfPossible(handleReprobe);
    },
    [handleReprobe, setRuntimeRegistry],
  );

  const handleAddRuntime = useCallback(
    (id: string, entry: RuntimeEntry) =>
      applyRuntimeMutation(() => apiClient.upsertRuntime(id, entry)),
    [apiClient, applyRuntimeMutation],
  );

  const handleUpdateRuntime = useCallback(
    (id: string, entry: RuntimeEntry) =>
      applyRuntimeMutation(() => apiClient.upsertRuntime(id, entry)),
    [apiClient, applyRuntimeMutation],
  );

  const handleRemoveRuntime = useCallback(
    (id: string) =>
      applyRuntimeMutation(() => apiClient.removeRuntime(id)),
    [apiClient, applyRuntimeMutation],
  );

  return {
    handleReprobe,
    handleAddRuntime,
    handleUpdateRuntime,
    handleRemoveRuntime,
  };
}

async function refreshEnvProbeIfPossible(
  handleReprobe: () => Promise<void>,
): Promise<void> {
  try {
    await handleReprobe();
  } catch {
    // Runtime mutation succeeded; the user can re-probe manually.
  }
}
