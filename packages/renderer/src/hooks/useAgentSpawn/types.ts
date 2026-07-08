import type {
  EffortDescriptor,
  IntegrationPreflightResponse,
  ModelDescriptor,
  RuntimeAccessModeOption,
  SpawnResponse,
} from "@f-mark/shared";
import type { RootScope } from "../../api/rootScope.js";

export interface AgentSpawnRuntime {
  id: string;
  displayName: string;
  available: boolean;
}

export interface ConnectingAgent {
  participantId: string;
  name: string;
  color: string;
  runtimeId: string;
  sessionId: string | null;
  startedAtMs: number;
}

export interface IntegrationSetupState {
  runtimeId: string;
  participantId: string;
  preflight: IntegrationPreflightResponse;
  suggestedName: string;
  color: string;
  rootScope: RootScope | null;
  model: string;
  effort: string;
}

export interface AgentSpawnValue {
  runtimes: AgentSpawnRuntime[];
  tmuxMissing: boolean;
  spawnDisabledReason: string | null;
  spawnError: string | null;
  connectingAgents: ConnectingAgent[];
  integrationSetupFor: IntegrationSetupState | null;
  setIntegrationSetupFor(s: IntegrationSetupState | null): void;
  setSpawnError(s: string | null): void;
  accessModeForRuntime(runtimeId: string): string;
  accessModeOptionsForRuntime(runtimeId: string): RuntimeAccessModeOption[];
  setAccessModeForRuntime(runtimeId: string, mode: string): void;
  modelForRuntime(runtimeId: string): string;
  effortForRuntime(runtimeId: string): string;
  modelOptionsForRuntime(runtimeId: string): ModelDescriptor[];
  effortOptionsForRuntime(runtimeId: string): EffortDescriptor[];
  setModelForRuntime(runtimeId: string, model: string): void;
  setEffortForRuntime(runtimeId: string, effort: string): void;
  onSpawnRuntime(runtimeId: string): void;
  onConfigureRuntime(runtimeId: string): void;
  onManageRuntimes(): void;
  onSpawnComplete(resp: SpawnResponse, name: string, color: string): void;
}
