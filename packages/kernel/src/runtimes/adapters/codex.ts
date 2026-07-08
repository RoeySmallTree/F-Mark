import { homedir } from "os";
import { join } from "path";
import type { RuntimeOverridePatch } from "@f-mark/shared";
import { sanitizeArgs as sanitize } from "../argSanitizer.js";
import { createCodexModelCatalog } from "./codex/modelCatalog.js";
import { createCodexRolloutReader } from "./codex/rolloutState.js";
import type { RuntimeAdapter } from "./types.js";

export interface CodexAdapterOptions {
  /* Path to ~/.codex/models_cache.json. Override for tests. */
  cachePath?: string;
  /* Path to ~/.codex/sessions/ root for the cwd-scan fallback. */
  sessionsRoot?: string;
  /* Max rollout files to scan during cwd fallback (newest first). */
  scanLimit?: number;
}

export function createCodexAdapter(
  options: CodexAdapterOptions = {},
): RuntimeAdapter {
  const cachePath =
    options.cachePath ?? join(homedir(), ".codex", "models_cache.json");
  const sessionsRoot =
    options.sessionsRoot ?? join(homedir(), ".codex", "sessions");
  const scanLimit = options.scanLimit ?? 20;
  const catalog = createCodexModelCatalog(cachePath);
  const rolloutReader = createCodexRolloutReader({ sessionsRoot, scanLimit });

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
    listModels: catalog.listModels,
    listEfforts: catalog.listEfforts,
    readCurrent: rolloutReader.readCurrent,
    buildSpawnArgs,
    buildSpawnEnv,
    sanitizeArgs,
  };
}
