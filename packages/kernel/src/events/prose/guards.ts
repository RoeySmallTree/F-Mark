import type { ProseMention } from "./types.js";

export function isLineRange(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  );
}

export function isMention(value: unknown): value is ProseMention {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { participant_id?: unknown }).participant_id === "string" &&
    typeof (value as { display_name?: unknown }).display_name === "string" &&
    typeof (value as { token?: unknown }).token === "string"
  );
}
