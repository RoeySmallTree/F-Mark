import { describe, it, expect } from "vitest";
import { aggregate } from "../../src/state/aggregate.js";
import type { AnyEventRecord } from "@f-mark/shared";

function prose(
  filename: string,
  participantId: string,
  payload: Record<string, unknown>,
): AnyEventRecord {
  return {
    filename,
    timestamp: filename.split("_")[0]!,
    participant_id: participantId,
    kind: "prose",
    payload: { content: "", ...payload },
  };
}

describe("aggregate with a coalesced message (array supersedes)", () => {
  it("hides delta fragments and remaps a comment on a delta to the coalesced event", () => {
    const d1 = prose("20260625T000001Z_ag-x.prose.md", "ag-x", {
      content: "Hello ",
      arbitrary: true,
      source: "hook",
    });
    const d2 = prose("20260625T000002Z_ag-x.prose.md", "ag-x", {
      content: "world",
      arbitrary: true,
      source: "hook",
    });
    const coalesced = prose("20260625T000003Z_ag-x.prose.md", "ag-x", {
      content: "Hello world",
      source: "hook",
      supersedes: [d1.filename, d2.filename],
    });
    // A user commented on the first streamed fragment before it was coalesced.
    const comment = prose("20260625T000004Z_us-x.prose.md", "us-x", {
      content: "nice",
      append_to: d1.filename,
      mode: "comment",
      lines: [1, 1],
    });

    const agg = aggregate([d1, d2, coalesced, comment]);

    const visible = agg.visible.map((e) => e.filename);
    expect(visible).toContain(coalesced.filename);
    expect(visible).not.toContain(d1.filename);
    expect(visible).not.toContain(d2.filename);

    // The comment re-anchors onto the coalesced event through the chain.
    const grouped = (agg.commentsByTarget.get(coalesced.filename) ?? []).map(
      (e) => e.filename,
    );
    expect(grouped).toContain(comment.filename);
  });
});
