import { readFile } from "node:fs/promises";
import { isMissingPathError, isObject } from "./object.js";

interface HookCommandHit {
  event: string;
  command: string;
  matcher?: string | null;
}

export async function readJsonObject(path: string): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(path, "utf8");
    if (raw.trim().length === 0) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed)) throw new Error("hooks JSON root must be an object");
    return parsed;
  } catch (err) {
    if (isMissingPathError(err)) return {};
    throw err;
  }
}

export function findJsonHookCommands(
  raw: string,
): HookCommandHit[] {
  const hooksRoot = parseJsonHooksRoot(raw);
  if (hooksRoot === null) return [];
  return Object.entries(hooksRoot).flatMap(([event, groups]) =>
    jsonHookCommandsForEvent(event, groups),
  );
}

function parseJsonHooksRoot(raw: string): Record<string, unknown> | null {
  if (raw.trim().length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(parsed) || !isObject(parsed.hooks)) return null;
  return parsed.hooks;
}

function jsonHookCommandsForEvent(event: string, groups: unknown): HookCommandHit[] {
  if (!Array.isArray(groups)) return [];
  return groups.flatMap((group) => jsonHookCommandsForGroup(event, group));
}

function jsonHookCommandsForGroup(event: string, group: unknown): HookCommandHit[] {
  if (!isObject(group) || !Array.isArray(group.hooks)) return [];
  const matcher = jsonGroupMatcher(group);
  return group.hooks.flatMap((hook) => jsonHookCommandForHook(event, hook, matcher));
}

function jsonHookCommandForHook(
  event: string,
  hook: unknown,
  matcher: string | null | undefined,
): HookCommandHit[] {
  if (!isObject(hook) || typeof hook.command !== "string") return [];
  return [
    {
      event,
      command: hook.command,
      ...(matcher !== undefined ? { matcher } : {}),
    },
  ];
}

function jsonGroupMatcher(group: Record<string, unknown>): string | null | undefined {
  if (typeof group.matcher === "string") return group.matcher;
  return group.matcher === null ? null : undefined;
}
