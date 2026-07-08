import { isFmarkAutoStreamCommand } from "../command.js";
import { isObject } from "./object.js";
import { CODEX_AUTOSTREAM_EVENTS } from "./spec.js";
import {
  codexHookHash,
  hookStateKey,
} from "./trustIdentity.js";

export interface CodexHookTrustEntry {
  key: string;
  hash: string;
}

export function fmarkHookTrustEntriesFromConfig(
  config: Record<string, unknown>,
  sourcePath: string,
): CodexHookTrustEntry[] {
  const hooksRoot = isObject(config.hooks) ? config.hooks : {};
  const entries: CodexHookTrustEntry[] = [];
  for (const event of CODEX_AUTOSTREAM_EVENTS) {
    entries.push(...fmarkHookTrustEntriesForEvent(hooksRoot[event], sourcePath, event));
  }
  return entries;
}

export function fmarkHookTrustEntriesFromJson(
  raw: string,
  sourcePath: string,
): CodexHookTrustEntry[] {
  const parsed = parseTrustJson(raw);
  return parsed === null ? [] : fmarkHookTrustEntriesFromConfig(parsed, sourcePath);
}

function fmarkHookTrustEntriesForEvent(
  groups: unknown,
  sourcePath: string,
  event: string,
): CodexHookTrustEntry[] {
  if (!Array.isArray(groups)) return [];
  return groups.flatMap((group, groupIndex) =>
    fmarkHookTrustEntriesForGroup(group, sourcePath, event, groupIndex),
  );
}

function fmarkHookTrustEntriesForGroup(
  group: unknown,
  sourcePath: string,
  event: string,
  groupIndex: number,
): CodexHookTrustEntry[] {
  if (!isObject(group) || !Array.isArray(group.hooks)) return [];
  return group.hooks.flatMap((hook, hookIndex) =>
    fmarkHookTrustEntryForHook({ group, hook, sourcePath, event, groupIndex, hookIndex }),
  );
}

function fmarkHookTrustEntryForHook(input: {
  group: Record<string, unknown>;
  hook: unknown;
  sourcePath: string;
  event: string;
  groupIndex: number;
  hookIndex: number;
}): CodexHookTrustEntry[] {
  if (!isObject(input.hook) || typeof input.hook.command !== "string") return [];
  if (!isFmarkAutoStreamCommand(input.hook.command)) return [];
  const key = hookStateKey(
    input.sourcePath,
    input.event,
    input.groupIndex,
    input.hookIndex,
  );
  const hash = codexHookHash({
    event: input.event,
    group: input.group,
    hook: input.hook,
  });
  return key !== null && hash !== null ? [{ key, hash }] : [];
}

function parseTrustJson(raw: string): Record<string, unknown> | null {
  if (raw.trim().length === 0) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
