import type { LineContext } from "./types.js";

export function lineContextFromFrontmatter(
  value: unknown,
): LineContext | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const context = value as {
    selected?: unknown;
    before?: unknown;
    after?: unknown;
    sha256?: unknown;
  };
  if (typeof context.selected !== "string") return undefined;
  if (typeof context.sha256 !== "string") return undefined;
  return {
    selected: context.selected,
    sha256: context.sha256,
    ...(typeof context.before === "string" ? { before: context.before } : {}),
    ...(typeof context.after === "string" ? { after: context.after } : {}),
  };
}
