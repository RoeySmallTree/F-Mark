import { readFile } from "fs/promises";
import type { EffortDescriptor, ModelDescriptor } from "@f-mark/shared";
import { effortsForModel } from "../modelEfforts.js";
import type { CodexCacheFile, CodexCacheModel } from "./types.js";

export interface CodexModelCatalog {
  listModels(opts?: { refresh?: boolean }): Promise<ModelDescriptor[]>;
  listEfforts(modelId?: string): Promise<EffortDescriptor[]>;
}

export function createCodexModelCatalog(cachePath: string): CodexModelCatalog {
  let cached: CodexCacheFile | null = null;

  async function loadCache(refresh = false): Promise<CodexCacheFile> {
    if (cached && !refresh) return cached;
    const raw = await readFile(cachePath, "utf8");
    cached = JSON.parse(raw) as CodexCacheFile;
    return cached;
  }

  async function listModels(
    opts: { refresh?: boolean } = {},
  ): Promise<ModelDescriptor[]> {
    const cache = await loadCache(opts.refresh ?? false);
    return (cache.models ?? [])
      .filter((model) => (model.visibility ?? "list") === "list")
      .map(toDescriptor);
  }

  async function listEfforts(modelId?: string): Promise<EffortDescriptor[]> {
    return effortsForModel(await listModels(), modelId);
  }

  return { listModels, listEfforts };
}

function toEfforts(
  levels: CodexCacheModel["supported_reasoning_levels"],
): EffortDescriptor[] {
  return (levels ?? []).map((level) => ({
    id: level.effort,
    displayName: level.effort,
    description: level.description,
  }));
}

function toDescriptor(model: CodexCacheModel): ModelDescriptor {
  return {
    id: model.slug,
    displayName: model.display_name ?? model.slug,
    description: model.description,
    contextWindowTokens: positiveNumber(model.context_window),
    maxContextWindowTokens: positiveNumber(model.max_context_window),
    efforts: toEfforts(model.supported_reasoning_levels),
    defaultEffort: model.default_reasoning_level,
  };
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}
