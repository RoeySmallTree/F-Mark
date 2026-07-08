import type { LineRange, MonacoLineSpan } from "./types.js";

export function normalizeSelectionLines(sel: MonacoLineSpan): LineRange | null {
  let start = sel.startLineNumber;
  let end = sel.endLineNumber;
  if (end > start && sel.endColumn === 1) end -= 1;
  if (end < start) return null;
  if (start < 1) start = 1;
  if (end < start) end = start;
  return [start, end];
}

export function lineRangeForGlyphClick(
  line: number,
  selection: MonacoLineSpan | null,
): LineRange {
  const normalized =
    selection !== null ? normalizeSelectionLines(selection) : null;
  if (
    normalized !== null &&
    line >= normalized[0] &&
    line <= normalized[1]
  ) {
    return normalized;
  }
  return [line, line];
}
