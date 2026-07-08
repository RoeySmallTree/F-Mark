import type { EffortDescriptor, ModelDescriptor } from "@f-mark/shared";
import { effortsForModel } from "../modelEfforts.js";
import { parseModelsVerbose } from "./modelParser.js";
import type { OpencodeCliRunner, VerboseEntry } from "./types.js";

const CACHE_TTL_MS = 5 * 60 * 1000;

export interface OpencodeModelCatalog {
  listModels(opts?: { refresh?: boolean }): Promise<ModelDescriptor[]>;
  listEfforts(modelId?: string): Promise<EffortDescriptor[]>;
}

export function createOpencodeModelCatalog(
  runCli: OpencodeCliRunner,
): OpencodeModelCatalog {
  let cachedModels: ModelDescriptor[] | null = null;
  let cacheAt = 0;

  async function listModels(
    opts: { refresh?: boolean } = {},
  ): Promise<ModelDescriptor[]> {
    if (cachedModels && !opts.refresh && Date.now() - cacheAt < CACHE_TTL_MS) {
      return cachedModels;
    }

    cachedModels = (await loadVerbose(opts.refresh ?? false)).map(toDescriptor);
    cacheAt = Date.now();
    return cachedModels;
  }

  async function listEfforts(modelId?: string): Promise<EffortDescriptor[]> {
    return effortsForModel(await listModels(), modelId);
  }

  async function loadVerbose(refresh: boolean): Promise<VerboseEntry[]> {
    const args = ["models", "--verbose"];
    if (refresh) args.push("--refresh");
    const result = await runCli(args);
    return parseModelsVerbose(result.stdout);
  }

  return { listModels, listEfforts };
}

function variantsToEfforts(
  variants?: Record<string, unknown>,
): EffortDescriptor[] {
  if (!variants) return [];
  return Object.keys(variants).map((id) => ({ id, displayName: id }));
}

function toDescriptor(entry: VerboseEntry): ModelDescriptor {
  return {
    id: entry.id,
    displayName: entry.json.name ?? entry.json.id ?? entry.id,
    description: entry.json.description,
    provider: entry.json.providerID,
    contextWindowTokens: contextWindowTokens(entry.json),
    efforts: variantsToEfforts(entry.json.variants),
  };
}

function contextWindowTokens(json: VerboseEntry["json"]): number | undefined {
  return (
    positiveNumber(json.contextWindow) ??
    positiveNumber(json.context_window) ??
    nestedPositiveNumber(json.context, ["window", "tokens", "max", "limit"]) ??
    nestedPositiveNumber(json.limits, ["context", "tokens", "max"]) ??
    nestedPositiveNumber(json.limit, ["context", "tokens", "max"])
  );
}

function nestedPositiveNumber(value: unknown, keys: string[]): number | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const hit = positiveNumber(record[key]);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}
