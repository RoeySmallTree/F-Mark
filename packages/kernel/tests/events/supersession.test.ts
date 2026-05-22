import { describe, it, expect } from "vitest";
import { applySupersession } from "../../src/events/supersession.js";
import type { AnyEventRecord } from "@f-mark/shared";

function ev(filename: string, payload: unknown = {}): AnyEventRecord {
  return {
    filename,
    timestamp: filename.split("_")[0]!,
    participant_id: "us-x",
    kind: "prose",
    payload,
  };
}

describe("applySupersession", () => {
  it("returns identity when no supersedes pointers", () => {
    const a = ev("20260522T000001Z_us-x.prose.md");
    const b = ev("20260522T000002Z_us-x.prose.md");
    expect(applySupersession([a, b]).map((e) => e.filename)).toEqual([
      a.filename,
      b.filename,
    ]);
  });

  it("hides events pointed at by a later supersedes", () => {
    const a = ev("20260522T000001Z_us-x.prose.md");
    const b = ev("20260522T000002Z_us-x.prose.md", { supersedes: a.filename });
    expect(applySupersession([a, b]).map((e) => e.filename)).toEqual([b.filename]);
  });

  it("hides choices by id when superseded", () => {
    const a = ev("20260522T000001Z_us-x.choices.json", {
      id: "c1",
      question: "?",
      options: [],
      multi: false,
    });
    const b = ev("20260522T000002Z_us-x.choices.json", {
      id: "c1",
      question: "?",
      options: [],
      multi: false,
      supersedes: a.filename,
    });
    expect(applySupersession([a, b]).map((e) => e.filename)).toEqual([b.filename]);
  });
});
