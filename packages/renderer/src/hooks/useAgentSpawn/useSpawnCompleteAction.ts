import { useCallback } from "react";
import type { SpawnResponse } from "@f-mark/shared";
import type { Client, RootScope } from "../../api/client.js";
import { spawnPresenceState } from "./state.js";
import type { AgentSpawnStoreBindings } from "./storeBindings.js";

const NO_LOOSE_STRING_VALUES = {
  agent: "agent",
} as const;

function scopeFromSpawnResponse(resp: SpawnResponse): RootScope | undefined {
  if (resp.path_id !== undefined && resp.path_id.length > 0) {
    return { pathId: resp.path_id };
  }
  if (resp.root !== undefined && resp.root.length > 0) {
    return { root: resp.root };
  }
  return undefined;
}

interface UseSpawnCompleteActionInput
  extends Pick<
    AgentSpawnStoreBindings,
    "addManagedAgent" | "upsertParticipant" | "setPresence"
  > {
  restClient: Client;
}

export function useSpawnCompleteAction({
  restClient,
  addManagedAgent,
  upsertParticipant,
  setPresence,
}: UseSpawnCompleteActionInput): (
  resp: SpawnResponse,
  suggestedName: string,
  color: string,
) => void {
  return useCallback(
    (resp: SpawnResponse, suggestedName: string, color: string) => {
      addManagedAgent({
        participant_id: resp.participant_id,
        tmux_session: resp.tmux_session,
        runtime_id: resp.runtime_id,
      });
      upsertParticipant(resp.participant_id, {
        kind: NO_LOOSE_STRING_VALUES.agent,
        name: suggestedName,
        color,
        active_session: resp.active_session,
        runtime_id: resp.runtime_id,
      });
      void restClient
        .updateParticipant(resp.participant_id, { color }, scopeFromSpawnResponse(resp))
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error("failed to persist agent color", err);
        });
      setPresence(resp.participant_id, {
        state: spawnPresenceState(resp),
        last_hook_at: null,
      });
    },
    [addManagedAgent, upsertParticipant, setPresence, restClient],
  );
}
