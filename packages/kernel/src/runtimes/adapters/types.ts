import type {
  CurrentRuntimeState,
  EffortDescriptor,
  ModelDescriptor,
  RuntimeOverridePatch,
} from "@f-mark/shared";

export interface AdapterReadContext {
  /* Runtime-side session id (codex rollout id, claude session uuid,
     opencode ses_*). Provided by the hook payload where available. */
  sessionId?: string;
  cwd?: string;
  transcriptPath?: string;
}

export interface RuntimeAdapter {
  runtimeId: "claude" | "codex" | "opencode";

  listModels(opts?: { refresh?: boolean }): Promise<ModelDescriptor[]>;
  listEfforts(modelId?: string): Promise<EffortDescriptor[]>;

  readCurrent(ctx: AdapterReadContext): Promise<CurrentRuntimeState | null>;

  /* Args the runtime CLI should receive to pin the requested model/effort.
     The caller is responsible for first running adapter.sanitizeArgs on
     any pre-existing args from runtimes.json before appending these. */
  buildSpawnArgs(patch: RuntimeOverridePatch): string[];
  buildSpawnEnv(patch: RuntimeOverridePatch): Record<string, string>;

  /* Strip flags from `existing` that would conflict with the override keys
     present in `patch`. NEVER mutates input. Critical because Codex and
     OpenCode crash on duplicate -m/--variant. */
  sanitizeArgs(existing: string[], patch: RuntimeOverridePatch): string[];
}
