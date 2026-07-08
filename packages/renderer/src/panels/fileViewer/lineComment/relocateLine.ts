const NO_LOOSE_STRING_VALUES = {
  stored: "stored",
  exact: "exact",
  context: "context",
  fallback: "fallback",
  none: "none",
} as const;

/* Line-drift repair for file comments.

   A file comment stores `line_context = { selected, before?, after?, sha256 }`
   (built by lineContext.ts) plus the original 1-based `lines` range. After the
   file is edited, the commented lines may have moved. Given the CURRENT file
   text, `relocateLine` recovers the best line to reveal, trying progressively
   weaker signals:

     (a) STORED  — the stored start line still contains the stored `selected`
                   text (no drift). Cheapest; preferred.
     (b) EXACT   — search the file for the exact `selected` block; reveal its
                   first line. Handles pure up/down drift.
     (c) CONTEXT — locate by the `before`/`after` neighbor snippets; reveal the
                   line just after `before` (or just before `after`). Handles
                   edits INSIDE the selection where the block text changed but
                   its surroundings did not.
     (d) FALLBACK — none matched, but the stored start line is still in range:
                   reveal it as a best-effort guess (flagged drifted).
     (e) NONE    — the file is shorter than the stored start line and nothing
                   matched: reveal nothing; the caller shows a drift hint.

   Pure + synchronous (unit-tested). Multi-line `selected` is matched as a
   contiguous run of lines. `sha256` is NOT recomputed here — it is an opaque
   fingerprint carried for future use; (a)/(b) compare the actual text, which
   is strictly stronger than comparing a hash. */

import type { LineContext } from "@f-mark/shared";

export type RelocateMethod =
  | "stored"
  | "exact"
  | "context"
  | "fallback"
  | "none";

export interface RelocateResult {
  /** 1-based line to reveal, or null when nothing could be located (method
   *  "none"). */
  line: number | null;
  method: RelocateMethod;
  /** True when the location is uncertain (fallback) or unknown (none) — the
   *  caller surfaces a subtle "comment location drifted" hint. */
  drifted: boolean;
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

/* Find the 1-based start line of the first contiguous run of `needleLines`
   inside `hayLines`. Returns null when absent or the needle is empty. */
function findBlock(hayLines: string[], needleLines: string[]): number | null {
  if (needleLines.length === 0) return null;
  const last = hayLines.length - needleLines.length;
  for (let i = 0; i <= last; i++) {
    let ok = true;
    for (let j = 0; j < needleLines.length; j++) {
      if (hayLines[i + j] !== needleLines[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return i + 1;
  }
  return null;
}

/** Re-locate the comment's target line in the current file text.
 *
 *  @param currentText  the file's CURRENT full text.
 *  @param lineContext  the stored fuzzy context (may be undefined for older
 *                      comments that predate line_context).
 *  @param storedLines  the comment's original inclusive 1-based [start, end]
 *                      range (may be undefined).
 */
export function relocateLine(
  currentText: string,
  lineContext: LineContext | undefined,
  storedLines: [number, number] | undefined,
): RelocateResult {
  const all = splitLines(currentText);
  const lineCount = all.length;
  const storedStart =
    storedLines !== undefined ? storedLines[0] : undefined;

  const selected = lineContext?.selected;
  const selectedLines =
    selected !== undefined && selected.length > 0 ? splitLines(selected) : null;

  /* (a) STORED: the stored start line still holds the selected block. */
  if (
    selectedLines !== null &&
    storedStart !== undefined &&
    storedStart >= 1 &&
    storedStart + selectedLines.length - 1 <= lineCount
  ) {
    let matches = true;
    for (let j = 0; j < selectedLines.length; j++) {
      if (all[storedStart - 1 + j] !== selectedLines[j]) {
        matches = false;
        break;
      }
    }
    if (matches) return { line: storedStart, method: NO_LOOSE_STRING_VALUES.stored, drifted: false };
  }

  /* (b) EXACT: the selected block appears somewhere (drifted up/down). */
  if (selectedLines !== null) {
    const at = findBlock(all, selectedLines);
    if (at !== null) return { line: at, method: NO_LOOSE_STRING_VALUES.exact, drifted: false };
  }

  /* (c) CONTEXT: locate by surrounding before/after snippets. */
  const before = lineContext?.before;
  const after = lineContext?.after;
  if (before !== undefined && before.length > 0) {
    const beforeLines = splitLines(before);
    const at = findBlock(all, beforeLines);
    if (at !== null) {
      /* The target sits immediately AFTER the `before` block. Clamp into the
         file (the block at the very end means the target line is the last
         line). */
      const target = Math.min(at + beforeLines.length, Math.max(1, lineCount));
      return { line: target, method: NO_LOOSE_STRING_VALUES.context, drifted: false };
    }
  }
  if (after !== undefined && after.length > 0) {
    const afterLines = splitLines(after);
    const at = findBlock(all, afterLines);
    if (at !== null) {
      /* The target sits immediately BEFORE the `after` block. */
      const target = Math.max(1, at - 1);
      return { line: target, method: NO_LOOSE_STRING_VALUES.context, drifted: false };
    }
  }

  /* (d) FALLBACK: nothing matched but the stored start line is still in range
     — reveal it as a best-effort, flagged drifted. */
  if (
    storedStart !== undefined &&
    storedStart >= 1 &&
    storedStart <= lineCount
  ) {
    return { line: storedStart, method: NO_LOOSE_STRING_VALUES.fallback, drifted: true };
  }

  /* (e) NONE: out of range and unmatched — reveal nothing. */
  return { line: null, method: NO_LOOSE_STRING_VALUES.none, drifted: true };
}
