import type { AgentStatusRow, Participant } from "@f-mark/shared";
import { useCallback } from "react";
import type { Client, RootScope } from "../../../../api/client.js";
import type { ManagedAgentsClient } from "../../../../api/managedAgents.js";
import type { BusyAction } from "../types.js";

const NO_LOOSE_STRING_VALUES = {
  rename: "rename",
  recolor: "recolor",
} as const;

type RunAgentAction = (
  id: string,
  action: BusyAction,
  fn: () => Promise<unknown>,
) => Promise<void>;

interface UseIdentityActionsParams {
  api: ManagedAgentsClient;
  restApi: Client;
  currentScope: RootScope | null;
  participants: Record<string, Participant>;
  upsertParticipant(id: string, participant: Participant): void;
  run: RunAgentAction;
  setPickingColorFor(next: string | null): void;
}

export function useIdentityActions({
  api,
  restApi,
  currentScope,
  participants,
  upsertParticipant,
  run,
  setPickingColorFor,
}: UseIdentityActionsParams) {
  const renameAgent = useCallback(
    (agent: AgentStatusRow, displayName: string) =>
      run(agent.participant_id, NO_LOOSE_STRING_VALUES.rename, () =>
        api.rename(agent.participant_id, { display_name: displayName }, currentScope),
      ),
    [api, currentScope, run],
  );

  const recolorAgent = useCallback(
    async (agent: AgentStatusRow, color: string): Promise<void> => {
      const existing = participants[agent.participant_id];
      if (existing !== undefined) {
        upsertParticipant(agent.participant_id, { ...existing, color });
      }
      await run(agent.participant_id, NO_LOOSE_STRING_VALUES.recolor, () =>
        restApi.updateParticipant(agent.participant_id, { color }, currentScope ?? undefined),
      );
      setPickingColorFor(null);
    },
    [currentScope, participants, restApi, run, setPickingColorFor, upsertParticipant],
  );

  return { renameAgent, recolorAgent };
}
