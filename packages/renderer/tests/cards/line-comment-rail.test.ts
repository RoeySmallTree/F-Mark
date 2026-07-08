import { describe, expect, test } from "vitest";
import { lineRangeForSelectedText } from "../../src/cards/lineCommentRail/sourceSelection.js";

describe("LineCommentRail source selection mapping", () => {
  test("maps rendered heading and list text back to markdown source lines", () => {
    const md = [
      "# Intro heading",
      "",
      "Plain paragraph",
      "",
      "- Alpha item",
      "- Beta item",
      "",
      "Final line",
    ].join("\n");

    expect(lineRangeForSelectedText(md, "Intro heading")).toEqual([1, 1]);
    expect(lineRangeForSelectedText(md, "Beta item")).toEqual([6, 6]);
    expect(lineRangeForSelectedText(md, "Alpha item\nBeta item")).toEqual([
      5,
      6,
    ]);
  });

  test("uses the approximate geometry range to choose between repeated text", () => {
    const md = ["Repeat me", "", "middle", "", "Repeat me"].join("\n");

    expect(lineRangeForSelectedText(md, "Repeat me", [5, 5])).toEqual([5, 5]);
    expect(lineRangeForSelectedText(md, "Repeat me", [1, 1])).toEqual([1, 1]);
  });
});
