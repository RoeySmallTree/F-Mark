import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { isMissingPathError } from "./object.js";
import { mergeCodexHookJson } from "./hookJsonMerge.js";
import { readJsonObject } from "./json.js";
import { codexConfigPath, codexHooksPath } from "./paths.js";
import { CodexHookSpecBuilder, createCodexHookSpec } from "./spec.js";
import { enableCodexHooksFeature } from "./toml.js";
import {
  fmarkHookTrustEntriesFromConfig,
  upsertHookTrustState,
} from "./trust.js";

class CodexHookInstaller {
  constructor(private readonly spec: CodexHookSpecBuilder) {}

  async apply(
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<{ changed: boolean; configPath: string; hooksPath: string }> {
    const configPath = codexConfigPath(env);
    const existingToml = await this.readCodexToml(configPath);
    let nextToml = enableCodexHooksFeature(existingToml);

    const hooksPath = codexHooksPath(env);
    const hooksJson = await readJsonObject(hooksPath);
    const staleTrustEntries = fmarkHookTrustEntriesFromConfig(hooksJson, hooksPath);
    const before = JSON.stringify(hooksJson);

    mergeCodexHookJson(hooksJson, this.spec);
    const trustEntries = fmarkHookTrustEntriesFromConfig(hooksJson, hooksPath);
    nextToml = upsertHookTrustState(nextToml, trustEntries, staleTrustEntries);

    let changed = await this.writeTomlIfChanged(configPath, nextToml, existingToml);
    const after = JSON.stringify(hooksJson);
    if (after !== before) {
      await mkdir(dirname(hooksPath), { recursive: true });
      await writeFile(hooksPath, `${JSON.stringify(hooksJson, null, 2)}\n`, "utf8");
      changed = true;
    }
    return { changed, configPath, hooksPath };
  }

  private async readCodexToml(configPath: string): Promise<string> {
    try {
      return await readFile(configPath, "utf8");
    } catch (err) {
      if (isMissingPathError(err)) return "";
      throw err;
    }
  }

  private async writeTomlIfChanged(
    configPath: string,
    nextToml: string,
    existingToml: string,
  ): Promise<boolean> {
    if (nextToml === existingToml) return false;
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, nextToml, "utf8");
    return true;
  }
}

export async function applyCodexHooks(
  agentId?: string,
  userId?: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ changed: boolean; configPath: string; hooksPath: string }> {
  return new CodexHookInstaller(createCodexHookSpec(agentId, userId)).apply(env);
}
