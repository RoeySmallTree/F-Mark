import { prunedHookGroups } from "./hookJsonPrune.js";
import { isObject } from "./object.js";
import type { CodexHookSpecBuilder } from "./spec.js";

export function mergeCodexHookJson(
  target: Record<string, unknown>,
  spec: CodexHookSpecBuilder,
): void {
  const hooks = ensureHooksRoot(target);
  const expected = spec.expectedHookGroups();
  for (const [event, groups] of Object.entries(expected)) {
    const current = prunedHookGroups(hooks[event], spec);
    for (const group of groups) {
      if (!hookGroupExists(current, group)) current.push(group);
    }
    hooks[event] = current;
  }
}

function ensureHooksRoot(target: Record<string, unknown>): Record<string, unknown> {
  if (!isObject(target.hooks)) target.hooks = {};
  return target.hooks as Record<string, unknown>;
}

function hookGroupExists(current: unknown[], group: unknown): boolean {
  const serialized = JSON.stringify(group);
  return current.some((entry) => JSON.stringify(entry) === serialized);
}
