import { createHash } from "node:crypto";
import { isObject } from "./object.js";

export function codexHookHash(input: {
  event: string;
  group: Record<string, unknown>;
  hook: Record<string, unknown>;
}): string | null {
  const eventName = hookEventStateLabel(input.event);
  if (eventName === null || typeof input.hook.command !== "string") return null;
  const identity = hookIdentity(eventName, input.group, input.hook);
  const serialized = JSON.stringify(canonicalJson(identity));
  return `sha256:${createHash("sha256").update(serialized).digest("hex")}`;
}

export function hookStateKey(
  sourcePath: string,
  event: string,
  groupIndex: number,
  hookIndex: number,
): string | null {
  const eventName = hookEventStateLabel(event);
  if (eventName === null) return null;
  return `${sourcePath}:${eventName}:${groupIndex}:${hookIndex}`;
}

function hookIdentity(
  eventName: string,
  group: Record<string, unknown>,
  hook: Record<string, unknown>,
): Record<string, unknown> {
  const identity: Record<string, unknown> = {
    event_name: eventName,
    hooks: [normalizedHook(hook)],
  };
  const matcher = normalizedMatcher(group);
  if (matcher !== undefined) identity.matcher = matcher;
  return identity;
}

function normalizedHook(hook: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {
    type: "command",
    command: hook.command,
    timeout: normalizedTimeout(hook.timeout),
    async: hook.async === true,
  };
  if (typeof hook.statusMessage === "string") {
    normalized.statusMessage = hook.statusMessage;
  }
  return normalized;
}

function normalizedMatcher(group: Record<string, unknown>): string | undefined {
  return typeof group.matcher === "string" && group.matcher.trim().length > 0
    ? group.matcher
    : undefined;
}

function normalizedTimeout(timeout: unknown): number {
  return typeof timeout === "number" && Number.isFinite(timeout)
    ? Math.max(1, timeout)
    : 600;
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!isObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    if (child !== undefined) out[key] = canonicalJson(child);
  }
  return out;
}

function hookEventStateLabel(event: string): string | null {
  if (event === "Stop") return "stop";
  if (event === "UserPromptSubmit") return "user_prompt_submit";
  if (event === "PermissionRequest") return "permission_request";
  if (event === "PostToolUse") return "post_tool_use";
  return null;
}
