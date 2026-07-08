import type { Dispatch, SetStateAction } from "react";
import type { Client } from "../../api/client.js";
import type { ManagedAgentsClient } from "../../api/managedAgents.js";
import type { RootScope } from "../../api/rootScope.js";
import type { AgentSpawnStoreBindings } from "./storeBindings.js";
import type {
  ConnectingAgent,
  IntegrationSetupState,
} from "./types.js";

export interface UseAgentSpawnActionsInput
  extends Pick<
    AgentSpawnStoreBindings,
    | "currentSessionId"
    | "managedAgentsDisabledReason"
    | "setManagedAgentsDisabledReason"
    | "addManagedAgent"
    | "upsertParticipant"
    | "setPresence"
    | "openSettings"
  > {
  apiClient: ManagedAgentsClient;
  restClient: Client;
  spawnRootScope: RootScope | null;
  setConnectingAgents: Dispatch<SetStateAction<ConnectingAgent[]>>;
  setIntegrationSetupFor: (state: IntegrationSetupState | null) => void;
  setSpawnError: (message: string | null) => void;
  accessModeForRuntime(runtimeId: string): string;
  modelForRuntime(runtimeId: string): string;
  effortForRuntime(runtimeId: string): string;
}
