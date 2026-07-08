import type {
  EffortDescriptor,
  IntegrationPreflightResponse,
  ModelDescriptor,
  RuntimeAccessModeOption,
  SpawnResponse,
} from "@f-mark/shared";
import type { ManagedAgentsClient } from "../../api/managedAgents.js";
import type { RootScope } from "../../api/rootScope.js";

export interface IntegrationSetupModalProps {
  runtimeId: string;
  participantId?: string;
  sessionId?: string;
  /** Optional display name for the spawned agent. When provided, it's
      passed through to /managed-agents/spawn so the participant lands
      with this name instead of the runtime default. */
  suggestedName?: string;
  rootScope?: RootScope | null;
  accessMode?: string;
  accessModeOptions?: RuntimeAccessModeOption[];
  onAccessModeChange?(mode: string): void;
  model?: string;
  effort?: string;
  modelOptions?: ModelDescriptor[];
  effortOptions?: EffortDescriptor[];
  onModelChange?(model: string): void;
  onEffortChange?(effort: string): void;
  initialPreflight?: IntegrationPreflightResponse;
  apiClient: ManagedAgentsClient;
  onClose(): void;
  onLaunched(response: SpawnResponse): void;
}

export type BusyState = "preflight" | "apply" | "launch" | null;
export type SetupTab = "global" | "local";
export type SetupItemKind = "runtime" | "mcp" | "hooks";
