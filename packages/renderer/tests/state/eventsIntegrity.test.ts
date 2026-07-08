import { describe, expect, test } from "vitest";
import type { AnyEventRecord } from "@f-mark/shared";
import { eventsMergeIntegrityOk } from "../../src/state/eventsIntegrity.js";
import { mergeEvents } from "../../src/state/mergeEvents.js";

function event(
  filename: string,
  payload: Record<string, unknown> = {},
): AnyEventRecord {
  return {
    filename,
    timestamp: filename.split("_")[0]!,
    participant_id: "us-a7f3",
    kind: "prose",
    payload: { content: filename, ...payload },
  };
}

describe("eventsMergeIntegrityOk", () => {
  test("accepts delta supersession targets that exist after merge", () => {
    const base = [event("20260601T120000Z_us-a7f3.prose.md")];
    const delta = [
      event("20260601T120001Z_us-a7f3.prose.md", {
        supersedes: base[0]!.filename,
      }),
    ];

    expect(eventsMergeIntegrityOk(mergeEvents(base, delta), delta)).toBe(true);
  });

  test("rejects missing supersession targets", () => {
    const delta = [
      event("20260601T120001Z_us-a7f3.prose.md", {
        supersedes: "20260601T115959Z_us-a7f3.prose.md",
      }),
    ];

    expect(eventsMergeIntegrityOk(mergeEvents([], delta), delta)).toBe(false);
  });

  test("rejects a missing append_to only when it is an event filename", () => {
    const delta = [
      event("20260601T120001Z_us-a7f3.prose.md", {
        append_to: "20260601T115959Z_us-a7f3.prose.md",
      }),
    ];

    expect(eventsMergeIntegrityOk(mergeEvents([], delta), delta)).toBe(false);
  });

  test("ignores append_to values that are not event filenames", () => {
    const delta = [
      event("20260601T120001Z_us-a7f3.prose.md", {
        append_to: "docs/readme.md",
      }),
    ];

    expect(eventsMergeIntegrityOk(mergeEvents([], delta), delta)).toBe(true);
  });
});
