import { isObject } from "./object.js";
import type { CodexHookSpecBuilder } from "./spec.js";

export function prunedHookGroups(
  value: unknown,
  spec: CodexHookSpecBuilder,
): unknown[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((group) => pruneHookGroup(group, spec))
    .filter((group): group is unknown => group !== null);
}

function pruneHookGroup(group: unknown, spec: CodexHookSpecBuilder): unknown | null {
  if (!isObject(group) || !Array.isArray(group.hooks)) return group;
  const nextHooks = group.hooks.filter((hook) => shouldKeepHook(hook, spec));
  return nextHooks.length > 0 ? { ...group, hooks: nextHooks } : null;
}

function shouldKeepHook(hook: unknown, spec: CodexHookSpecBuilder): boolean {
  if (!isObject(hook) || typeof hook.command !== "string") return true;
  return !spec.isFmarkCommand(hook.command);
}
