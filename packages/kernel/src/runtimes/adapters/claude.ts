import { readFile } from "fs/promises";
import type {
  CurrentRuntimeState,
  EffortDescriptor,
  ModelDescriptor,
  RuntimeOverridePatch,
} from "@f-mark/shared";
import { sanitizeArgs as sanitize } from "../argSanitizer.js";
import type { AdapterReadContext, RuntimeAdapter } from "./types.js";

const CLAUDE_MODELS: ModelDescriptor[] = [
  { id: "claude-opus-4-7", displayName: "Opus 4.7", description: "Highest-capability model." },
  { id: "claude-sonnet-4-6", displayName: "Sonnet 4.6", description: "Balanced model." },
  { id: "claude-haiku-4-5", displayName: "Haiku 4.5", description: "Fastest model." },
];

const CLAUDE_EFFORTS: EffortDescriptor[] = [
  { id: "low", displayName: "Low" },
  { id: "medium", displayName: "Medium" },
  { id: "high", displayName: "High" },
  { id: "xhigh", displayName: "X-high" },
  { id: "max", displayName: "Max" },
];

export function createClaudeAdapter(): RuntimeAdapter {
  async function listModels(): Promise<ModelDescriptor[]> {
    return CLAUDE_MODELS;
  }

  async function listEfforts(): Promise<EffortDescriptor[]> {
    return CLAUDE_EFFORTS;
  }

  async function readCurrent(
    ctx: AdapterReadContext,
  ): Promise<CurrentRuntimeState | null> {
    if (!ctx.transcriptPath) return null;
    let raw: string;
    try {
      raw = await readFile(ctx.transcriptPath, "utf8");
    } catch {
      return null;
    }
    let lastModel: string | undefined;
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      let entry: unknown;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const obj = entry as {
        type?: string;
        message?: { model?: unknown };
      };
      if (obj.type !== "assistant") continue;
      const m = obj.message?.model;
      if (typeof m === "string" && m !== "<synthetic>") {
        lastModel = m;
      }
    }
    if (!lastModel) return null;
    return {
      model: lastModel,
      // effort: undefined — Phase 0 confirmed it's not observable
      source: "transcript",
      observedAt: Date.now(),
    };
  }

  function buildSpawnArgs(patch: RuntimeOverridePatch): string[] {
    const out: string[] = [];
    if (patch.model) out.push("--model", patch.model);
    if (patch.effort) out.push("--effort", patch.effort);
    return out;
  }

  function buildSpawnEnv(_patch: RuntimeOverridePatch): Record<string, string> {
    return {};
  }

  function sanitizeArgs(
    existing: string[],
    patch: RuntimeOverridePatch,
  ): string[] {
    return sanitize(existing, "claude", patch);
  }

  return {
    runtimeId: "claude",
    listModels,
    listEfforts,
    readCurrent,
    buildSpawnArgs,
    buildSpawnEnv,
    sanitizeArgs,
  };
}
