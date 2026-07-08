import type { RuntimeOverridePatch } from "@f-mark/shared";
import { sanitizeArgs as sanitize } from "../argSanitizer.js";
import { defaultRunCli } from "./opencode/cli.js";
import { createOpencodeCurrentStateReader } from "./opencode/currentState.js";
import { createOpencodeModelCatalog } from "./opencode/modelCatalog.js";
import type { OpencodeCliRunner } from "./opencode/types.js";
import type { RuntimeAdapter } from "./types.js";

export type { OpencodeCliRunner } from "./opencode/types.js";

export interface OpencodeAdapterOptions {
  runCli?: OpencodeCliRunner;
  /* Override the binary name. Defaults to "opencode". */
  binary?: string;
}

export function createOpencodeAdapter(
  options: OpencodeAdapterOptions = {},
): RuntimeAdapter {
  const runCli = options.runCli ?? defaultRunCli(options.binary ?? "opencode");
  const catalog = createOpencodeModelCatalog(runCli);
  const currentState = createOpencodeCurrentStateReader(runCli);

  function buildSpawnArgs(patch: RuntimeOverridePatch): string[] {
    const out: string[] = [];
    if (patch.model) out.push("-m", patch.model);
    if (patch.effort) out.push("--variant", patch.effort);
    return out;
  }

  function buildSpawnEnv(_patch: RuntimeOverridePatch): Record<string, string> {
    return {};
  }

  function sanitizeArgs(
    existing: string[],
    patch: RuntimeOverridePatch,
  ): string[] {
    return sanitize(existing, "opencode", patch);
  }

  return {
    runtimeId: "opencode",
    listModels: catalog.listModels,
    listEfforts: catalog.listEfforts,
    readCurrent: currentState.readCurrent,
    buildSpawnArgs,
    buildSpawnEnv,
    sanitizeArgs,
  };
}
