import type { AgentStatusRow } from "@f-mark/shared";
import { useCallback } from "react";
import type { RootScope } from "../../../../api/client.js";
import type { ManagedAgentsClient } from "../../../../api/managedAgents.js";
import type { ConfirmedIntent } from "../../../../confirm/index.js";
import type { BusyAction } from "../types.js";

const NO_LOOSE_STRING_VALUES = {
  goodbye: "goodbye",
} as const;

type RunAgentAction = (
  id: string,
  action: BusyAction,
  fn: () => Promise<unknown>,
) => Promise<void>;

interface UseGoodbyeActionParams {
  api: ManagedAgentsClient;
  currentScope: RootScope | null;
  run: RunAgentAction;
}

export function useGoodbyeAction({
  api,
  currentScope,
  run,
}: UseGoodbyeActionParams) {
  const goodbye = useCallback(
    (agent: AgentStatusRow, intent: ConfirmedIntent) =>
      run(agent.participant_id, NO_LOOSE_STRING_VALUES.goodbye, async () => {
        const token = await api.getConfirmToken(agent.participant_id);
        await api.goodbye(agent.participant_id, token, currentScope, intent);
      }),
    [api, currentScope, run],
  );

  return { goodbye };
}
