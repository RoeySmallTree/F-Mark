import type { CommentTarget } from "../../state/store.js";
import {
  normalizeLines,
  rangeEquals,
  type LineRange,
} from "./lineGeometry.js";

const NO_LOOSE_STRING_VALUES = {
  event: "event",
} as const;

export function targetMatches(
  active: CommentTarget | null,
  file: string,
  lines: LineRange,
): boolean {
  if (active === null || active.kind !== NO_LOOSE_STRING_VALUES.event || active.file !== file) {
    return false;
  }
  if (active.lines === undefined) return false;
  return rangeEquals(normalizeLines(active.lines, Number.MAX_SAFE_INTEGER), lines);
}

export function targetFrom(file: string, lines: LineRange): CommentTarget {
  return { kind: NO_LOOSE_STRING_VALUES.event, file, lines };
}

export function highlightLinesForTarget(
  active: CommentTarget | null,
  file: string,
  lineCount: number,
): LineRange | null {
  return active !== null &&
    active.kind === NO_LOOSE_STRING_VALUES.event &&
    active.file === file &&
    active.lines !== undefined
    ? normalizeLines(active.lines, lineCount)
    : null;
}
