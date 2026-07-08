/* Part 3 — "added to document" affordance.

   When a block is appended (consumed) into a named anchor that sits earlier
   in the timeline, the block vanishes from its own slot. The aggregate must
   surface a coalesced "stub" candidate at the block's position so the feed
   can show "Added to <doc> — jump ↑", plus track the newest ADJACENT block
   per anchor so a same-turn append can advance the anchor's read key (and
   clear its relit dot) without a stub. */

import { describe, expect, test } from "vitest";
import { aggregate } from "../../src/state/aggregate.js";
import { makeProse } from "../cards/_helpers.js";

const ANCHOR = "20260101T100000Z_ag-c.prose.md";

function anchor(filename: string, name: string) {
  return makeProse(filename, "ag-c", { name, content: "" });
}
function block(filename: string, appendTo: string, content: string) {
  return makeProse(filename, "ag-c", { content, append_to: appendTo });
}
function message(filename: string, content: string) {
  return makeProse(filename, "ag-c", { content });
}

describe("aggregate — consumed-block stubs", () => {
  test("a block appended to an earlier anchor after intervening content yields a non-adjacent stub", () => {
    const a = anchor(ANCHOR, "Redesign Doc");
    const mid = message("20260101T110000Z_ag-c.prose.md", "unrelated");
    const late = block("20260101T120000Z_ag-c.prose.md", ANCHOR, "the brief");

    const agg = aggregate([a, mid, late]);

    expect(agg.consumedStubs).toHaveLength(1);
    expect(agg.consumedStubs[0]).toMatchObject({
      anchorFilename: ANCHOR,
      docName: "Redesign Doc",
      newestBlockFilename: late.filename,
      blockCount: 1,
    });
    // The block is still consumed (folded into the anchor), not loose in feed.
    expect(agg.feed.some((e) => e.filename === late.filename)).toBe(false);
  });

  test("a block appended immediately after its anchor (same turn) is adjacent — no stub, but advances the anchor read key", () => {
    const a = anchor(ANCHOR, "Doc");
    const b = block("20260101T100001Z_ag-c.prose.md", ANCHOR, "section 1");

    const agg = aggregate([a, b]);

    expect(agg.consumedStubs).toHaveLength(0);
    expect(agg.anchorAdjacentReadKey.get(ANCHOR)).toBe(b.filename);
  });

  test("consecutive blocks to the same anchor coalesce into one stub keyed by the newest", () => {
    const a = anchor(ANCHOR, "Doc");
    const mid = message("20260101T110000Z_ag-c.prose.md", "unrelated");
    const b1 = block("20260101T120000Z_ag-c.prose.md", ANCHOR, "part 1");
    const b2 = block("20260101T120001Z_ag-c.prose.md", ANCHOR, "part 2");

    const agg = aggregate([a, mid, b1, b2]);

    expect(agg.consumedStubs).toHaveLength(1);
    expect(agg.consumedStubs[0]).toMatchObject({
      anchorFilename: ANCHOR,
      newestBlockFilename: b2.filename,
      blockCount: 2,
    });
  });

  test("an orphan block (append_to a missing anchor) gets no stub", () => {
    const orphan = block("20260101T120000Z_ag-c.prose.md", "20260101T000000Z_ag-c.prose.md", "lost");

    const agg = aggregate([orphan]);

    expect(agg.consumedStubs).toHaveLength(0);
    expect(agg.orphanBlocks.has(orphan.filename)).toBe(true);
  });
});
