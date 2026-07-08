import type { AgentStatusRow } from "@f-mark/shared";
import { useCallback } from "react";
import type { RootScope } from "../../../../api/client.js";
import type { ManagedAgentsClient } from "../../../../api/managedAgents.js";
import type { BusyAction } from "../types.js";

const NO_LOOSE_STRING_VALUES = {
  reconnect: "reconnect",
} as const;

type RunAgentAction = (
  id: string,
  action: BusyAction,
  fn: () => Promise<unknown>,
) => Promise<void>;

interface UseRuntimeActionsParams {
  api: ManagedAgentsClient;
  currentScope: RootScope | null;
  run: RunAgentAction;
}

export function useRuntimeActions({
  api,
  currentScope,
  run,
}: UseRuntimeActionsParams) {
  const setRuntimeModel = useCallback(
    (agent: AgentStatusRow, model: string) =>
      run(agent.participant_id, NO_LOOSE_STRING_VALUES.reconnect, () =>
        api.setRuntime(
          agent.participant_id,
          { model: model.length > 0 ? model : null },
          currentScope,
        ),
      ),
    [api, currentScope, run],
  );

  const setRuntimeEffort = useCallback(
    (agent: AgentStatusRow, effort: string) =>
      run(agent.participant_id, NO_LOOSE_STRING_VALUES.reconnect, () =>
        api.setRuntime(
          agent.participant_id,
          { effort: effort.length > 0 ? effort : null },
          currentScope,
        ),
      ),
    [api, currentScope, run],
  );

  const setAccessMode = useCallback(
    (agent: AgentStatusRow, mode: string) =>
      run(agent.participant_id, NO_LOOSE_STRING_VALUES.reconnect, () =>
        api.setAccess(agent.participant_id, { mode }, currentScope),
      ),
    [api, currentScope, run],
  );

  return { setRuntimeModel, setRuntimeEffort, setAccessMode };
}
