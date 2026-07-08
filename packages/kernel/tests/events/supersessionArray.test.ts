import { describe, it, expect } from "vitest";
import { applySupersession } from "../../src/events/supersession.js";
import type { AnyEventRecord } from "@f-mark/shared";

function ev(filename: string, payload: unknown = {}): AnyEventRecord {
  return {
    filename,
    timestamp: filename.split("_")[0]!,
    participant_id: "ag-x",
    kind: "prose",
    payload,
  };
}

/* A coalesced assistant message supersedes the N streamed delta files it
   replaces. `supersedes` therefore must accept a list of filenames, and
   `applySupersession` must hide every one of them. */
describe("applySupersession with array supersedes", () => {
  it("hides every filename listed in a supersedes array", () => {
    const a = ev("20260625T000001Z_ag-x.prose.md");
    const b = ev("20260625T000002Z_ag-x.prose.md");
    const final = ev("20260625T000003Z_ag-x.prose.md", {
      content: "ab",
      supersedes: [a.filename, b.filename],
    });
    expect(applySupersession([a, b, final]).map((e) => e.filename)).toEqual([
      final.filename,
    ]);
  });

  it("still hides a single superseded filename (string form)", () => {
    const a = ev("20260625T000001Z_ag-x.prose.md");
    const b = ev("20260625T000002Z_ag-x.prose.md", { supersedes: a.filename });
    expect(applySupersession([a, b]).map((e) => e.filename)).toEqual([b.filename]);
  });

  it("ignores empty strings inside a supersedes array", () => {
    const a = ev("20260625T000001Z_ag-x.prose.md");
    const b = ev("20260625T000002Z_ag-x.prose.md", {
      supersedes: ["", a.filename],
    });
    expect(applySupersession([a, b]).map((e) => e.filename)).toEqual([b.filename]);
  });
});
