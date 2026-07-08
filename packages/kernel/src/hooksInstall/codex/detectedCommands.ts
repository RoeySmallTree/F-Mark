import type { HookEntry } from "../types.js";
import { findJsonHookCommands } from "./json.js";
import type { CodexHookSpecBuilder } from "./spec.js";
import {
  findHookCommands,
  normalizeDetectedCommand,
} from "./toml.js";

export function detectCodexHookEntries(
  toml: string,
  hooksJson: string,
  spec: CodexHookSpecBuilder,
): HookEntry[] {
  const hits = [...findHookCommands(toml), ...findJsonHookCommands(hooksJson)];
  return hits.flatMap((hit) => detectedEntryForHit(hit, spec));
}

function detectedEntryForHit(
  hit: { event: string; command: string; matcher?: string | null },
  spec: CodexHookSpecBuilder,
): HookEntry[] {
  const normalizedCommand = normalizeDetectedCommand(hit.command);
  if (!spec.isSupportedEvent(hit.event)) return [];
  if (!spec.isFmarkCommand(normalizedCommand)) return [];
  return [
    {
      event: hit.event,
      command: normalizedCommand,
      ...(hit.matcher !== undefined ? { matcher: hit.matcher } : {}),
      version: spec.versionFor(normalizedCommand),
    },
  ];
}
