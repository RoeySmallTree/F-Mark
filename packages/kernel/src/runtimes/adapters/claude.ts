import { readFile } from "fs/promises";
import type {
  CurrentRuntimeState,
  RuntimeOverridePatch,
} from "@f-mark/shared";
import { sanitizeArgs as sanitize } from "../argSanitizer.js";
import { defaultRunCli } from "./claude/cli.js";
import { createClaudeModelCatalog } from "./claude/modelCatalog.js";
import type { ClaudeCliRunner } from "./claude/types.js";
import type { AdapterReadContext, RuntimeAdapter } from "./types.js";

export interface ClaudeAdapterOptions {
  runCli?: ClaudeCliRunner;
  /* Override the binary name. Defaults to "claude". */
  binary?: string;
}

/* Live transcripts can contain provider aliases ("fable", "opus") and
   date-suffixed full slugs ("claude-fable-5-20261001"). Keep aliases as
   aliases because the current provider CLI accepts and advertises them, while
   trimming only trailing date suffixes from full slugs for stable display. */
export function canonicalizeClaudeModelId(raw: string): string {
  const lower = raw.trim().toLowerCase();
  const stripped = lower.replace(/^(claude-[a-z0-9]+(?:-\d+)*?)-\d{6,}$/, "$1");
  return stripped;
}

export function createClaudeAdapter(
  options: ClaudeAdapterOptions = {},
): RuntimeAdapter {
  const runCli = options.runCli ?? defaultRunCli(options.binary ?? "claude");
  const catalog = createClaudeModelCatalog(runCli);

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
        lastModel = canonicalizeClaudeModelId(m);
      }
    }
    if (!lastModel) return null;
    return {
      model: lastModel,
      // effort: undefined; Claude transcripts do not expose it.
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
    listModels: catalog.listModels,
    listEfforts: catalog.listEfforts,
    readCurrent,
    buildSpawnArgs,
    buildSpawnEnv,
    sanitizeArgs,
  };
}
