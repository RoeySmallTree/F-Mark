import type { LineContext } from "@f-mark/shared";
import { sha256Hex } from "./sha256.js";

/* Build the fuzzy re-anchor context for a file comment.

   Given the file's full text and an inclusive 1-based `[start, end]` line
   range, capture:
     - `selected` — the commented lines joined by "\n",
     - `before`   — up to `neighbors` lines immediately above (joined),
     - `after`    — up to `neighbors` lines immediately below (joined),
     - `sha256`   — fingerprint of `selected` (drift detection).

   `before`/`after` are omitted when empty so the payload stays minimal. The
   range is clamped to the file's bounds defensively. */
export function buildLineContext(
  fullText: string,
  lines: [number, number],
  neighbors = 3,
): LineContext {
  const all = fullText.split(/\r?\n/);
  const max = Math.max(1, all.length);
  const start = Math.min(Math.max(1, lines[0]), max);
  const end = Math.min(Math.max(start, lines[1]), max);

  const selected = all.slice(start - 1, end).join("\n");
  const before = all.slice(Math.max(0, start - 1 - neighbors), start - 1).join("\n");
  const after = all.slice(end, Math.min(all.length, end + neighbors)).join("\n");

  return {
    selected,
    ...(before.length > 0 ? { before } : {}),
    ...(after.length > 0 ? { after } : {}),
    sha256: sha256Hex(selected),
  };
}

/** A short single-line preview of the selected range for popover chrome. */
export function snippetForLines(
  fullText: string,
  lines: [number, number],
  max = 120,
): string {
  const text = fullText
    .split(/\r?\n/)
    .slice(lines[0] - 1, lines[1])
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}
