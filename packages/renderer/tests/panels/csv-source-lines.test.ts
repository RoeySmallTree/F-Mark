/* Phase 3b — CSV row → SOURCE line mapping.

   Papa parses with `skipEmptyLines: true`, dropping blank source lines from the
   record list while source-line counting keeps them. The rail anchors CSV
   comments by real `data-source-line` numbers, so the record→line map must skip
   blank raw lines. */

import { describe, expect, test } from "vitest";
import { sourceLinesForRecords } from "../../src/panels/fileViewer/renderers/CsvRenderer.js";

describe("sourceLinesForRecords", () => {
  test("maps consecutive records to consecutive 1-based source lines", () => {
    const raw = "h1,h2\na,b\nc,d\n";
    /* header + 2 rows */
    expect(sourceLinesForRecords(raw, 3)).toEqual([1, 2, 3]);
  });

  test("skips blank source lines that Papa drops (skipEmptyLines)", () => {
    /* line1 header, line2 blank, line3 row, line4 blank, line5 row */
    const raw = "h1,h2\n\na,b\n\nc,d\n";
    expect(sourceLinesForRecords(raw, 3)).toEqual([1, 3, 5]);
  });

  test("handles leading blank lines", () => {
    const raw = "\n\nh1,h2\na,b\n";
    expect(sourceLinesForRecords(raw, 2)).toEqual([3, 4]);
  });

  test("tolerates CRLF and whitespace-only lines", () => {
    const raw = "h1,h2\r\n   \r\na,b\r\n";
    expect(sourceLinesForRecords(raw, 2)).toEqual([1, 3]);
  });
});
