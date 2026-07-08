import { codexConfigPath, codexHooksPath } from "./paths.js";

export type CodexDetectInput =
  | string
  | { toml: string; hooksJson?: string; configPath?: string };

export interface NormalizedCodexDetectInput {
  toml: string;
  hooksJson: string;
  configPath: string;
}

export function normalizeCodexDetectInput(
  input: CodexDetectInput,
): NormalizedCodexDetectInput {
  if (typeof input === "string") {
    return {
      toml: input,
      hooksJson: "",
      configPath: codexConfigPath(),
    };
  }
  const hooksJson = input.hooksJson ?? "";
  return {
    toml: input.toml,
    hooksJson,
    configPath:
      input.configPath ?? (hooksJson.trim().length > 0 ? codexHooksPath() : codexConfigPath()),
  };
}
