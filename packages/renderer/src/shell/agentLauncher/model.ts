import type {
  EffortDescriptor,
  ModelDescriptor,
  RuntimeAccessModeOption,
} from "@f-mark/shared";
import type { AgentSpawnRuntime } from "../../hooks/useAgentSpawn.js";
import type { ProviderCardModel, ProviderMeta, ProviderStatus } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  ready: "ready",
  missing: "missing",
} as const;

/* Display metadata for known runtimes. Falls back to a generic block
   when the runtime id is unknown — better than failing to render. */
const PROVIDER_META: Record<string, ProviderMeta> = {
  claude: {
    vendor: "Anthropic",
    desc: "File-aware, project-rooted, MCP-ready. The most context-aware coding agent.",
  },
  codex: {
    vendor: "OpenAI",
    desc: "Browser-augmented, sandboxed exec. Strong at multi-step refactors.",
  },
  opencode: {
    vendor: "Community",
    desc: "BYO model, runs local or hosted. Fully open-source, no vendor lock-in.",
  },
};

function metaForRuntime(runtime: AgentSpawnRuntime): ProviderMeta {
  const known = PROVIDER_META[runtime.id];
  if (known !== undefined) return known;
  return {
    vendor: "CLI agent",
    desc: "Configure to install or connect this runtime.",
  };
}

function statusForRuntime(runtime: AgentSpawnRuntime): ProviderStatus {
  return runtime.available ? NO_LOOSE_STRING_VALUES.ready : NO_LOOSE_STRING_VALUES.missing;
}

export function buildProviderCardModel({
  runtime,
  accessMode,
  accessModeOptions,
  model,
  effort,
  modelOptions,
  effortOptions,
  connecting,
}: {
  runtime: AgentSpawnRuntime;
  accessMode: string;
  accessModeOptions: RuntimeAccessModeOption[];
  model: string;
  effort: string;
  modelOptions: ModelDescriptor[];
  effortOptions: EffortDescriptor[];
  connecting: boolean;
}): ProviderCardModel {
  const status = statusForRuntime(runtime);
  return {
    runtime,
    meta: metaForRuntime(runtime),
    status,
    isReady: status === NO_LOOSE_STRING_VALUES.ready,
    connecting,
    accessMode,
    accessModeOptions,
    model,
    effort,
    modelOptions,
    effortOptions,
  };
}

export function accessModeOptionLabel(
  option: RuntimeAccessModeOption,
): string {
  return `${option.label}${option.deprecated === true ? " (deprecated)" : ""}`;
}
