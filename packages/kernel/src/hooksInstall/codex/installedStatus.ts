import type { HookEntry } from "../types.js";
import type { CodexHookSpecBuilder } from "./spec.js";
import { codexHooksEnabled } from "./toml.js";

export function codexHooksInstalledByConfig(
  toml: string,
  detected: HookEntry[],
  spec: CodexHookSpecBuilder,
): boolean {
  return (
    codexHooksEnabled(toml) &&
    hasExpected(detected, "Stop", spec) &&
    hasExpected(detected, "UserPromptSubmit", spec) &&
    hasExpected(detected, "PostToolUse", spec) &&
    hasCapturedPermissionRequest(detected, spec)
  );
}

function hasExpected(
  detected: HookEntry[],
  event: string,
  spec: CodexHookSpecBuilder,
): boolean {
  return detected.some(
    (entry) => entry.event === event && spec.isExpectedEntry(event, entry.command),
  );
}

function hasCapturedPermissionRequest(
  detected: HookEntry[],
  spec: CodexHookSpecBuilder,
): boolean {
  return detected.some(
    (entry) =>
      entry.event === "PermissionRequest" &&
      spec.isExpectedEntry(entry.event, entry.command) &&
      spec.capturesPermissionRequest(entry.matcher),
  );
}
