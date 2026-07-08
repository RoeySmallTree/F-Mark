import { useCallback, useState } from "react";
import type { ManagedAgentsClient } from "../../api/managedAgents.js";
import {
  isProcessApiDisabledError,
  PROCESS_API_DISABLED_MESSAGE,
} from "../../api/managedAgents.js";
import type { TopBarModalContextValue } from "../../app/topBarModalContext.js";

interface SpawnTerminalActionInput {
  apiClient: ManagedAgentsClient;
  addManagedTerminal(terminal: {
    tmux_session: string;
    label: string;
    index: number;
  }): void;
  managedAgentsDisabledReason: string | null;
  modalContext: TopBarModalContextValue | null;
  setManagedAgentsDisabledReason(reason: string | null): void;
}

interface SpawnTerminalAction {
  spawnTerminalError: string | null;
  onSpawnTerminal(): void;
}

export function useSpawnTerminalAction({
  apiClient,
  addManagedTerminal,
  managedAgentsDisabledReason,
  modalContext,
  setManagedAgentsDisabledReason,
}: SpawnTerminalActionInput): SpawnTerminalAction {
  const [spawnTerminalError, setSpawnTerminalError] = useState<string | null>(null);

  const onSpawnTerminal = useCallback((): void => {
    setSpawnTerminalError(null);
    if (managedAgentsDisabledReason !== null) {
      setSpawnTerminalError(managedAgentsDisabledReason);
      return;
    }
    void apiClient
      .spawnTerminal()
      .then((resp) => {
        addManagedTerminal({
          tmux_session: resp.tmux_session,
          label: resp.label,
          index: resp.index,
        });
        modalContext?.openTerminalOverlay(resp.tmux_session);
      })
      .catch((error: unknown) => {
        if (isProcessApiDisabledError(error)) {
          setManagedAgentsDisabledReason(PROCESS_API_DISABLED_MESSAGE);
          setSpawnTerminalError(PROCESS_API_DISABLED_MESSAGE);
        } else {
          setSpawnTerminalError(error instanceof Error ? error.message : String(error));
        }
        console.error("spawn terminal failed", error);
      });
  }, [
    addManagedTerminal,
    apiClient,
    managedAgentsDisabledReason,
    modalContext,
    setManagedAgentsDisabledReason,
  ]);

  return { spawnTerminalError, onSpawnTerminal };
}
