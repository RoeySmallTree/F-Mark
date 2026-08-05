/* M2 — a removed comment used to reach every non-renderer consumer as a
   visible prose event whose body was the literal string `_removed_`. The
   comment it superseded was already hidden by applySupersession; the marker
   itself was not. These tests pin both halves. */
import { describe, it, expect } from "vitest";
import type { AnyEventRecord } from "@f-mark/shared";
import {
  COMMENT_MARKER_CONTENT,
  isCommentMarkerEvent,
  isCommentRemovedMarker,
  isCommentResolutionMarker,
} from "@f-mark/shared";

function prose(filename: string, payload: unknown = {}): AnyEventRecord {
  return {
    filename,
    timestamp: filename.split("_")[0] as string,
    participant_id: "us-x",
    kind: "prose",
    payload,
  } as AnyEventRecord;
}

const TARGET = "20260805T000001Z_us-x.prose.md";

describe("comment supersession markers", () => {
  it("recognises a removal marker", () => {
    const marker = prose("20260805T000002Z_us-x.prose.md", {
      content: COMMENT_MARKER_CONTENT.removed,
      supersedes: TARGET,
      append_to: "20260805T000000Z_us-x.prose.md",
      mode: "comment",
    });
    expect(isCommentRemovedMarker(marker)).toBe(true);
    expect(isCommentMarkerEvent(marker)).toBe(true);
  });

  it("recognises resolve and unresolve markers", () => {
    const resolved = prose("20260805T000003Z_us-x.prose.md", {
      content: COMMENT_MARKER_CONTENT.resolved,
      supersedes: TARGET,
    });
    const unresolved = prose("20260805T000004Z_us-x.prose.md", {
      content: COMMENT_MARKER_CONTENT.unresolved,
      supersedes: TARGET,
    });
    expect(isCommentResolutionMarker(resolved)).toBe(true);
    expect(isCommentResolutionMarker(unresolved)).toBe(true);
  });

  it("does not treat a real comment that merely mentions the marker as one", () => {
    const realComment = prose("20260805T000005Z_us-x.prose.md", {
      content: `the tombstone is written as ${COMMENT_MARKER_CONTENT.removed} today`,
      supersedes: TARGET,
    });
    expect(isCommentMarkerEvent(realComment)).toBe(false);
  });

  it("requires a supersedes pointer — a bare marker word is not a marker", () => {
    const orphan = prose("20260805T000006Z_us-x.prose.md", {
      content: COMMENT_MARKER_CONTENT.removed,
    });
    expect(isCommentMarkerEvent(orphan)).toBe(false);
  });

  it("ignores non-prose events", () => {
    const toolUse = {
      filename: "20260805T000007Z_us-x.tool_use.md",
      timestamp: "20260805T000007Z",
      participant_id: "us-x",
      kind: "tool_use",
      payload: {
        content: COMMENT_MARKER_CONTENT.removed,
        supersedes: TARGET,
      },
    } as unknown as AnyEventRecord;
    expect(isCommentMarkerEvent(toolUse)).toBe(false);
  });
});
