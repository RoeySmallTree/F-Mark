import { describe, it, expect } from "vitest";
import { aggregate } from "../src/state/aggregate.js";
import type { AnyEventRecord } from "@f-mark/shared";

function prose(
  filename: string,
  payload: Record<string, unknown>,
): AnyEventRecord {
  return {
    filename,
    timestamp: filename.split("_")[0]!,
    participant_id: "us-x",
    kind: "prose",
    payload: { content: "", ...payload },
  };
}

describe("aggregate", () => {
  it("groups visible feed (excludes superseded + comments)", () => {
    const a = prose("20260522T000001Z_us-x.prose.md", { content: "hi" });
    const b = prose("20260522T000002Z_us-x.prose.md", {
      content: "comment",
      target: { file: a.filename },
    });
    const c = prose("20260522T000003Z_us-x.prose.md", {
      content: "v2",
      supersedes: a.filename,
    });
    const agg = aggregate([a, b, c]);
    expect(agg.feed.map((e) => e.filename)).toEqual([c.filename]);
  });

  it("derives named list", () => {
    const a = prose("20260522T000001Z_us-x.prose.md", {
      content: "x",
      name: "Plan",
    });
    const b = prose("20260522T000002Z_us-x.prose.md", { content: "y" });
    expect(aggregate([a, b]).named.map((e) => e.filename)).toEqual([a.filename]);
  });

  it("groups comments by target filename", () => {
    const a = prose("20260522T000001Z_us-x.prose.md", { content: "anchor" });
    const c1 = prose("20260522T000002Z_us-x.prose.md", {
      content: "first",
      target: { file: a.filename },
    });
    const c2 = prose("20260522T000003Z_us-x.prose.md", {
      content: "second",
      target: { file: a.filename },
    });
    const agg = aggregate([a, c1, c2]);
    expect(agg.commentsByTarget.get(a.filename)?.map((c) => c.filename)).toEqual([
      c1.filename,
      c2.filename,
    ]);
  });

  it("derives current turn from latest turn-end", () => {
    const tend: AnyEventRecord = {
      filename: "20260522T000004Z_ag-c.turn-end.json",
      timestamp: "20260522T000004Z",
      participant_id: "ag-c",
      kind: "turn-end",
      payload: { participant_id: "ag-c" },
    };
    const agg = aggregate([tend]);
    expect(agg.currentTurnParticipantPrefix).toBe("us");
  });

  it("defaults turn to user if no turn-end", () => {
    expect(aggregate([]).currentTurnParticipantPrefix).toBe("us");
  });
});
