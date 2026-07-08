import type { ProsePayload, ProseFrontmatter } from "@f-mark/shared";
import { STRING_FRONTMATTER_KEYS } from "./types.js";

export function copyDefinedStringFields(
  source: Partial<ProsePayload | ProseFrontmatter>,
  target: Partial<ProsePayload | ProseFrontmatter>,
): void {
  for (const key of STRING_FRONTMATTER_KEYS) {
    const value = source[key];
    if (typeof value === "string") target[key] = value;
  }
}

/**
 * Normalize a `supersedes` value (scalar or list). Preserves string-vs-array
 * so it round-trips, drops empty strings, and returns undefined when nothing
 * usable remains.
 */
export function normalizeSupersedes(
  value: unknown,
): string | string[] | undefined {
  if (typeof value === "string") return value.length > 0 ? value : undefined;
  if (Array.isArray(value)) {
    const items = value.filter(
      (item): item is string => typeof item === "string" && item.length > 0,
    );
    return items.length > 0 ? items : undefined;
  }
  return undefined;
}
