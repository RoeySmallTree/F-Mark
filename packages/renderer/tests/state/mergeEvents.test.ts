import { describe, expect, test } from "vitest";
import type { AnyEventRecord } from "@f-mark/shared";
import { mergeEvents } from "../../src/state/mergeEvents.js";

function event(filename: string, content: string): AnyEventRecord {
  return {
    filename,
    timestamp: filename.split("_")[0]!,
    participant_id: "us-a7f3",
    kind: "prose",
    payload: { content },
  };
}

describe("mergeEvents", () => {
  test("dedupes by filename with delta winning", () => {
    const filename = "20260601T120000Z_us-a7f3.prose.md";

    const merged = mergeEvents(
      [event(filename, "old")],
      [event(filename, "new")],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]!.payload).toEqual({ content: "new" });
  });

  test("sorts by normalized timestamp then filename", () => {
    const merged = mergeEvents(
      [
        event("20260601T120002Z_us-a7f3.prose.md", "two"),
        event("20260601T120001.001Z_us-a7f3.prose.md", "one point one"),
      ],
      [event("20260601T120001Z_us-a7f3.prose.md", "one")],
    );

    expect(merged.map((item) => item.filename)).toEqual([
      "20260601T120001Z_us-a7f3.prose.md",
      "20260601T120001.001Z_us-a7f3.prose.md",
      "20260601T120002Z_us-a7f3.prose.md",
    ]);
  });
});
