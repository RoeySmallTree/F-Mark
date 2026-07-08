/* Runtime adapter DTOs — serializable types only.
   The behavioural RuntimeAdapter interface lives in the kernel
   (packages/kernel/src/runtimes/adapters/types.ts). Shared keeps wire types. */

export type EffortLevel = string;

export interface EffortDescriptor {
  id: EffortLevel;
  displayName: string;
  description?: string;
}

export interface ModelDescriptor {
  id: string;
  displayName: string;
  description?: string;
  provider?: string;
  contextWindowTokens?: number;
  maxContextWindowTokens?: number;
  efforts?: EffortDescriptor[];
  defaultEffort?: EffortLevel;
}

/* Where the current state came from. Affects how stale UI considers it
   and whether "configured override" should win the display. */
export type RuntimeStateSource =
  | "rollout"      // codex JSONL turn_context
  | "transcript"   // claude JSONL message.model
  | "opencode-db"  // opencode primary
  | "export"       // opencode last-resort
  | "sqlite"       // opencode middle fallback
  | "config"       // codex global config.toml
  | "override"     // just-written override; not yet observed live
  | "unknown";

export const RUNTIME_STATE_SOURCES = {
  rollout: "rollout",
  transcript: "transcript",
  opencodeDb: "opencode-db",
  export: "export",
  sqlite: "sqlite",
  config: "config",
  override: "override",
  unknown: "unknown",
} as const satisfies Record<string, RuntimeStateSource>;

export interface CurrentRuntimeState {
  model?: string;
  effort?: EffortLevel;
  provider?: string;
  contextUsedTokens?: number;
  contextWindowTokens?: number;
  source: RuntimeStateSource;
  observedAt: number;
  /* Override the user pinned via /managed-agents/:id/runtime. Persisted
     on Participant; surfaced here so the UI can show "configured X · live Y"
     when they differ (e.g. Claude live-effort is unobservable). */
  configuredModel?: string;
  configuredEffort?: EffortLevel;
}

export interface RuntimeOverridePatch {
  model?: string | null;
  effort?: EffortLevel | null;
}
