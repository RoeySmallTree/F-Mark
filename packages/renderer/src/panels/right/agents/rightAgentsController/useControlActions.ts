import type { AgentStatusRow } from "@f-mark/shared";
import { useCallback } from "react";
import type { RootScope } from "../../../../api/client.js";
import type { ManagedAgentsClient } from "../../../../api/managedAgents.js";
import type { BusyAction } from "../types.js";

const NO_LOOSE_STRING_VALUES = {
  resume: "resume",
  pause: "pause",
  interrupt: "interrupt",
  compact: "compact",
  clear: "clear",
  reconnect: "reconnect",
} as const;

type RunAgentAction = (
  id: string,
  action: BusyAction,
  fn: () => Promise<unknown>,
) => Promise<void>;

interface UseControlActionsParams {
  api: ManagedAgentsClient;
  currentScope: RootScope | null;
  run: RunAgentAction;
}

export function useControlActions({
  api,
  currentScope,
  run,
}: UseControlActionsParams) {
  const pauseOrResume = useCallback(
    (agent: AgentStatusRow) =>
      run(agent.participant_id, agent.paused ? NO_LOOSE_STRING_VALUES.resume : NO_LOOSE_STRING_VALUES.pause, () =>
        agent.paused
          ? api.resume(agent.participant_id, currentScope)
          : api.pause(agent.participant_id, currentScope),
      ),
    [api, currentScope, run],
  );

  const interrupt = useCallback(
    (agent: AgentStatusRow) =>
      run(agent.participant_id, NO_LOOSE_STRING_VALUES.interrupt, () =>
        api.command(agent.participant_id, { type: NO_LOOSE_STRING_VALUES.interrupt }, currentScope),
      ),
    [api, currentScope, run],
  );

  const compact = useCallback(
    (agent: AgentStatusRow) =>
      run(agent.participant_id, NO_LOOSE_STRING_VALUES.compact, () =>
        api.compact(agent.participant_id, currentScope),
      ),
    [api, currentScope, run],
  );

  const clear = useCallback(
    (agent: AgentStatusRow) =>
      run(agent.participant_id, NO_LOOSE_STRING_VALUES.clear, () =>
        api.clear(agent.participant_id, currentScope),
      ),
    [api, currentScope, run],
  );

  const reconnect = useCallback(
    (agent: AgentStatusRow) =>
      run(agent.participant_id, NO_LOOSE_STRING_VALUES.reconnect, () =>
        api.reconnect(agent.participant_id, currentScope),
      ),
    [api, currentScope, run],
  );

  return { pauseOrResume, interrupt, compact, clear, reconnect };
}
