import { useCallback } from "react";
import type { ManagedAgentsClient } from "../../api/managedAgents.js";
import type { RootScope } from "../../api/rootScope.js";
import { createAgentSpawnDraft } from "./agentIdentity.js";
import { describeAgentSpawnFailure } from "./errors.js";
import { buildPreflightRequest } from "./requests.js";
import type { AgentSpawnStoreBindings } from "./storeBindings.js";
import type { IntegrationSetupState } from "./types.js";

interface UseConfigureRuntimeActionInput
  extends Pick<
    AgentSpawnStoreBindings,
    "managedAgentsDisabledReason" | "setManagedAgentsDisabledReason"
  > {
  apiClient: ManagedAgentsClient;
  spawnRootScope: RootScope | null;
  setIntegrationSetupFor: (state: IntegrationSetupState | null) => void;
  setSpawnError: (message: string | null) => void;
  modelForRuntime(runtimeId: string): string;
  effortForRuntime(runtimeId: string): string;
}

export function useConfigureRuntimeAction({
  apiClient,
  managedAgentsDisabledReason,
  setManagedAgentsDisabledReason,
  spawnRootScope,
  setIntegrationSetupFor,
  setSpawnError,
  modelForRuntime,
  effortForRuntime,
}: UseConfigureRuntimeActionInput): (runtimeId: string) => void {
  return useCallback(
    (runtimeId: string) => {
      setSpawnError(null);
      if (managedAgentsDisabledReason !== null) {
        setSpawnError(managedAgentsDisabledReason);
        return;
      }
      void (async () => {
        try {
          const draft = createAgentSpawnDraft(runtimeId);
          const preflight = await apiClient.preflight(
            buildPreflightRequest(
              runtimeId,
              draft.participantId,
              spawnRootScope,
            ),
          );
          setIntegrationSetupFor({
            runtimeId,
            participantId: draft.participantId,
            preflight,
            suggestedName: draft.suggestedName,
            color: draft.color,
            rootScope: spawnRootScope,
            model: modelForRuntime(runtimeId),
            effort: effortForRuntime(runtimeId),
          });
        } catch (e: unknown) {
          const failure = describeAgentSpawnFailure(e);
          if (failure.processApiDisabled) {
            setManagedAgentsDisabledReason(failure.message);
          }
          setSpawnError(failure.message);
        }
      })();
    },
    [
      apiClient,
      managedAgentsDisabledReason,
      effortForRuntime,
      modelForRuntime,
      setIntegrationSetupFor,
      setManagedAgentsDisabledReason,
      setSpawnError,
      spawnRootScope,
    ],
  );
}
