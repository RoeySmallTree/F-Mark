import { describe, expect, test } from "vitest";
import type { AnyEventRecord } from "@f-mark/shared";
import { aggregate } from "../../src/state/aggregate.js";
import { mergeEvents } from "../../src/state/mergeEvents.js";

function prose(
  filename: string,
  payload: Record<string, unknown>,
): AnyEventRecord {
  return {
    filename,
    timestamp: filename.split("_")[0]!,
    participant_id: filename.includes("_us-") ? "us-a7f3" : "ag-a7f3",
    kind: "prose",
    payload: { content: "", ...payload },
  };
}

describe("session event incremental aggregation", () => {
  test("comment on a superseded delta remaps after incremental merge", () => {
    const deltaA = prose("20260601T120000Z_ag-a7f3.prose.md", {
      content: "Hello ",
      arbitrary: true,
    });
    const deltaB = prose("20260601T120001Z_ag-a7f3.prose.md", {
      content: "world",
      arbitrary: true,
    });
    const comment = prose("20260601T120002Z_us-a7f3.prose.md", {
      content: "nice",
      append_to: deltaA.filename,
      mode: "comment",
      lines: [1, 1],
    });
    const coalesced = prose("20260601T120003Z_ag-a7f3.prose.md", {
      content: "Hello world",
      supersedes: [deltaA.filename, deltaB.filename],
    });

    const merged = mergeEvents([deltaA, deltaB, comment], [coalesced]);
    const aggregated = aggregate(merged);

    expect(aggregated.visible.map((item) => item.filename)).toContain(
      coalesced.filename,
    );
    expect(aggregated.visible.map((item) => item.filename)).not.toContain(
      deltaA.filename,
    );
    expect(
      (aggregated.commentsByTarget.get(coalesced.filename) ?? []).map(
        (item) => item.filename,
      ),
    ).toContain(comment.filename);
  });
});
