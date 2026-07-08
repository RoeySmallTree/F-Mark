import { describe, expect, it } from "vitest";
import type { AnyEventRecord, SessionEventGroup } from "@f-mark/shared";
import { mergeSessionEventGroups } from "../../src/panels/allSessions.js";

function event(filename: string, content: string): AnyEventRecord {
  return {
    filename,
    timestamp: filename.slice(0, filename.indexOf("_")),
    participant_id: "us-test",
    kind: "prose",
    payload: { content },
  };
}

function group(
  sessionId: string,
  events: AnyEventRecord[],
  pathId = "path-a",
): SessionEventGroup {
  return {
    path: `/repo/${pathId}`,
    path_id: pathId,
    session: {
      id: sessionId,
      slug: sessionId,
      created_at: "20200101T000000.000Z",
    },
    events,
    participants: {},
  };
}

describe("mergeSessionEventGroups", () => {
  it("appends new events and sorts them by timestamp then filename", () => {
    const merged = mergeSessionEventGroups(
      [
        group("s1", [
          event("20200101T000002.000Z_us-test.prose.md", "two"),
        ]),
      ],
      [
        group("s1", [
          event("20200101T000001.000Z_us-test.prose.md", "one"),
          event("20200101T000003.000Z_us-test.prose.md", "three"),
        ]),
      ],
    );

    expect(merged[0]!.events.map((item) => item.payload)).toEqual([
      { content: "one" },
      { content: "two" },
      { content: "three" },
    ]);
  });

  it("dedupes overlap by filename", () => {
    const filename = "20200101T000001.000Z_us-test.prose.md";
    const merged = mergeSessionEventGroups(
      [group("s1", [event(filename, "old")])],
      [group("s1", [event(filename, "new")])],
    );

    expect(merged[0]!.events).toHaveLength(1);
    expect(merged[0]!.events[0]!.payload).toEqual({ content: "new" });
  });

  it("preserves existing groups that are not present in the delta", () => {
    const merged = mergeSessionEventGroups(
      [
        group("s1", [event("20200101T000001.000Z_us-test.prose.md", "one")]),
        group("s2", [event("20200101T000002.000Z_us-test.prose.md", "two")]),
      ],
      [group("s1", [event("20200101T000003.000Z_us-test.prose.md", "three")])],
    );

    expect(merged.some((item) => item.session.id === "s2")).toBe(true);
    expect(
      merged
        .find((item) => item.session.id === "s1")!
        .events.map((item) => item.payload),
    ).toEqual([{ content: "one" }, { content: "three" }]);
  });

  it("adds delta groups that do not yet exist", () => {
    const merged = mergeSessionEventGroups(
      [group("s1", [event("20200101T000001.000Z_us-test.prose.md", "one")])],
      [
        group("s2", [event("20200101T000002.000Z_us-test.prose.md", "two")]),
      ],
    );

    expect(merged.map((item) => item.session.id).sort()).toEqual(["s1", "s2"]);
  });
});
