import type {
  EffortDescriptor,
  ModelDescriptor,
  RuntimeAccessModeOption,
} from "@f-mark/shared";
import type { AgentSpawnRuntime } from "../../hooks/useAgentSpawn.js";

export type ProviderStatus = "ready" | "missing";

export interface ProviderMeta {
  vendor: string;
  desc: string;
}

export interface ProviderCardModel {
  runtime: AgentSpawnRuntime;
  meta: ProviderMeta;
  status: ProviderStatus;
  isReady: boolean;
  /** A spawn for this runtime is in flight in the current session. */
  connecting: boolean;
  accessMode: string;
  accessModeOptions: RuntimeAccessModeOption[];
  model: string;
  effort: string;
  modelOptions: ModelDescriptor[];
  effortOptions: EffortDescriptor[];
}

export interface AgentLauncherController {
  runtimes: ProviderCardModel[];
  disabled: boolean;
  spawnError: string | null;
  onManageRuntimes(): void;
  onOpenRuntimeSettings(): void;
  onSpawnRuntime(runtimeId: string): void;
  onConfigureRuntime(runtimeId: string): void;
  onAccessModeChange(runtimeId: string, mode: string): void;
  onModelChange(runtimeId: string, model: string): void;
  onEffortChange(runtimeId: string, effort: string): void;
}
