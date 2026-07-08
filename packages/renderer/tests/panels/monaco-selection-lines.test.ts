/* Phase 3b — Monaco selection line normalization.

   A selection dragged from line N down to the START of line N+1 yields
   `endLineNumber === N+1, endColumn === 1` with no text actually selected on
   line N+1. Posting `[N, N+1]` overcounts the trailing line, so the renderer
   normalizes the range to the touched non-empty source lines before storing /
   posting. These cover the pure helper that does it. */

import { describe, expect, test } from "vitest";
import { normalizeSelectionLines } from "../../src/panels/fileViewer/renderers/MonacoRenderer.js";

describe("normalizeSelectionLines", () => {
  test("drops a trailing line when the selection ends at column 1 of the next line", () => {
    expect(
      normalizeSelectionLines({
        startLineNumber: 3,
        endLineNumber: 6,
        endColumn: 1,
      }),
    ).toEqual([3, 5]);
  });

  test("keeps the last line when the selection reaches into it (endColumn > 1)", () => {
    expect(
      normalizeSelectionLines({
        startLineNumber: 3,
        endLineNumber: 6,
        endColumn: 4,
      }),
    ).toEqual([3, 6]);
  });

  test("a single-line selection is unchanged", () => {
    expect(
      normalizeSelectionLines({
        startLineNumber: 7,
        endLineNumber: 7,
        endColumn: 12,
      }),
    ).toEqual([7, 7]);
  });

  test("a selection from line N to the START of N+1 collapses to a single line", () => {
    expect(
      normalizeSelectionLines({
        startLineNumber: 9,
        endLineNumber: 10,
        endColumn: 1,
      }),
    ).toEqual([9, 9]);
  });

  test("clamps a start below 1 to 1", () => {
    expect(
      normalizeSelectionLines({
        startLineNumber: 0,
        endLineNumber: 0,
        endColumn: 5,
      }),
    ).toEqual([1, 1]);
  });
});
