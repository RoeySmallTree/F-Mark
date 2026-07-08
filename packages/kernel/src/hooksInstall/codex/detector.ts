import type { DetectResult } from "../types.js";
import {
  normalizeCodexDetectInput,
  type CodexDetectInput,
} from "./detectInput.js";
import { detectCodexHookEntries } from "./detectedCommands.js";
import { codexHooksInstalledByConfig } from "./installedStatus.js";
import { CodexHookSpecBuilder, createCodexHookSpec } from "./spec.js";
import { codexHooksTrusted } from "./trustVerifier.js";

class CodexHookDetector {
  constructor(private readonly spec: CodexHookSpecBuilder) {}

  detect(input: CodexDetectInput): DetectResult {
    const source = normalizeCodexDetectInput(input);
    const detected = detectCodexHookEntries(
      source.toml,
      source.hooksJson,
      this.spec,
    );
    const installedByConfig = codexHooksInstalledByConfig(
      source.toml,
      detected,
      this.spec,
    );
    const installed = installedByConfig && codexHooksTrusted(source);

    return {
      installed,
      status: installed ? "installed" : detected.length > 0 ? "stale" : "missing",
      configPath: source.configPath,
      expectedVersion: this.spec.expectedVersion,
      detectedVersion: detected[0]?.version ?? null,
      detectedEntries: detected,
      expectedEntries: this.spec.expectedEntries(),
    };
  }
}

export function detectCodexHooks(
  input: CodexDetectInput,
  agentId?: string,
  userId?: string,
): DetectResult {
  return new CodexHookDetector(createCodexHookSpec(agentId, userId)).detect(input);
}
