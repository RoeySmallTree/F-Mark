import type { AgentStatusRow } from "@f-mark/shared";
import { useCallback, useState } from "react";
import type { ManagedAgentsClient } from "../../../../api/managedAgents.js";
import { ManagedAgentsApiError } from "../../../../api/managedAgents.js";
import type { RootScope } from "../../../../api/client.js";
import type { RuntimeOptions } from "../types.js";
import { errorMessage } from "./errorMessage.js";

export function useRuntimeOptions(
  api: ManagedAgentsClient,
  currentScope: RootScope | null,
  setError: (message: string | null) => void,
) {
  const [runtimeOptions, setRuntimeOptions] = useState<
    Record<string, RuntimeOptions>
  >({});
  const [runtimeOptionsLoading, setRuntimeOptionsLoading] = useState<
    Record<string, boolean>
  >({});

  const loadRuntimeOptions = useCallback(
    async (agent: AgentStatusRow): Promise<void> => {
      if (runtimeOptions[agent.participant_id] !== undefined) return;
      setRuntimeOptionsLoading((prev) => ({
        ...prev,
        [agent.participant_id]: true,
      }));
      try {
        const modelId =
          agent.runtime_state?.configuredModel ?? agent.runtime_state?.model;
        const models = await api.runtimeModels(agent.participant_id, {
          scope: currentScope,
        });
        const efforts = await api.runtimeEfforts(
          agent.participant_id,
          modelId,
          currentScope,
        );
        setRuntimeOptions((prev) => ({
          ...prev,
          [agent.participant_id]: { models, efforts },
        }));
        setRuntimeOptionsLoading((prev) => ({
          ...prev,
          [agent.participant_id]: false,
        }));
      } catch (err) {
        if (isStaleAgentOptionsError(err)) {
          setRuntimeOptions((prev) => ({
            ...prev,
            [agent.participant_id]: { models: [], efforts: [] },
          }));
          setRuntimeOptionsLoading((prev) => ({
            ...prev,
            [agent.participant_id]: false,
          }));
          return;
        }
        setRuntimeOptionsLoading((prev) => ({
          ...prev,
          [agent.participant_id]: false,
        }));
        setError(errorMessage(err));
      }
    },
    [api, currentScope, runtimeOptions, setError],
  );

  return { runtimeOptions, runtimeOptionsLoading, loadRuntimeOptions };
}

function isStaleAgentOptionsError(err: unknown): boolean {
  return (
    err instanceof ManagedAgentsApiError &&
    err.status === 404 &&
    (err.backendError?.includes("agent not found") ?? false)
  );
}
