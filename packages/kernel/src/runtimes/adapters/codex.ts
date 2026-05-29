import { readFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import type {
  CurrentRuntimeState,
  EffortDescriptor,
  ModelDescriptor,
  RuntimeOverridePatch,
} from "@f-mark/shared";
import { sanitizeArgs as sanitize } from "../argSanitizer.js";
import type { AdapterReadContext, RuntimeAdapter } from "./types.js";

interface CodexCacheModel {
  slug: string;
  display_name?: string;
  description?: string;
  default_reasoning_level?: string;
  supported_reasoning_levels?: Array<{
    effort: string;
    description?: string;
  }>;
  visibility?: string;
}

interface CodexCacheFile {
  models?: CodexCacheModel[];
}

export interface CodexAdapterOptions {
  /* Path to ~/.codex/models_cache.json. Override for tests. */
  cachePath?: string;
}

export function createCodexAdapter(
  options: CodexAdapterOptions = {},
): RuntimeAdapter {
  const cachePath =
    options.cachePath ?? join(homedir(), ".codex", "models_cache.json");

  let cached: CodexCacheFile | null = null;

  async function loadCache(refresh = false): Promise<CodexCacheFile> {
    if (cached && !refresh) return cached;
    const raw = await readFile(cachePath, "utf8");
    cached = JSON.parse(raw) as CodexCacheFile;
    return cached;
  }

  function toEfforts(
    levels: CodexCacheModel["supported_reasoning_levels"],
  ): EffortDescriptor[] {
    return (levels ?? []).map((l) => ({
      id: l.effort,
      displayName: l.effort,
      description: l.description,
    }));
  }

  function toDescriptor(m: CodexCacheModel): ModelDescriptor {
    return {
      id: m.slug,
      displayName: m.display_name ?? m.slug,
      description: m.description,
      efforts: toEfforts(m.supported_reasoning_levels),
      defaultEffort: m.default_reasoning_level,
    };
  }

  async function listModels(
    opts: { refresh?: boolean } = {},
  ): Promise<ModelDescriptor[]> {
    const cache = await loadCache(opts.refresh ?? false);
    const models = cache.models ?? [];
    return models
      .filter((m) => (m.visibility ?? "list") === "list")
      .map(toDescriptor);
  }

  async function listEfforts(modelId?: string): Promise<EffortDescriptor[]> {
    const models = await listModels();
    if (modelId) {
      const m = models.find((x) => x.id === modelId);
      return m?.efforts ?? [];
    }
    const seen = new Set<string>();
    const out: EffortDescriptor[] = [];
    for (const m of models) {
      for (const e of m.efforts ?? []) {
        if (!seen.has(e.id)) {
          seen.add(e.id);
          out.push(e);
        }
      }
    }
    return out;
  }

  async function readCurrent(
    ctx: AdapterReadContext,
  ): Promise<CurrentRuntimeState | null> {
    if (ctx.transcriptPath) {
      const state = await readFromRollout(ctx.transcriptPath);
      if (state) return state;
    }
    return null;
  }

  async function readFromRollout(
    path: string,
  ): Promise<CurrentRuntimeState | null> {
    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch {
      return null;
    }
    let lastModel: string | undefined;
    let lastEffort: string | undefined;
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      const entry = parsed as { type?: string; payload?: Record<string, unknown> };
      if (entry.type !== "turn_context" || !entry.payload) continue;
      const m = entry.payload.model;
      const e = entry.payload.effort ?? entry.payload.reasoning_effort;
      if (typeof m === "string") lastModel = m;
      if (typeof e === "string") lastEffort = e;
    }
    if (!lastModel && !lastEffort) return null;
    return {
      model: lastModel,
      effort: lastEffort,
      source: "rollout",
      observedAt: Date.now(),
    };
  }

  function buildSpawnArgs(patch: RuntimeOverridePatch): string[] {
    const out: string[] = [];
    if (patch.model) out.push("-m", patch.model);
    if (patch.effort) out.push("-c", `model_reasoning_effort=${patch.effort}`);
    return out;
  }

  function buildSpawnEnv(_patch: RuntimeOverridePatch): Record<string, string> {
    return {};
  }

  function sanitizeArgs(
    existing: string[],
    patch: RuntimeOverridePatch,
  ): string[] {
    return sanitize(existing, "codex", patch);
  }

  return {
    runtimeId: "codex",
    listModels,
    listEfforts,
    readCurrent,
    buildSpawnArgs,
    buildSpawnEnv,
    sanitizeArgs,
  };
}
