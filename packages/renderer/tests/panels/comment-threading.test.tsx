import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import type { AnyEventRecord } from "@f-mark/shared";
import { buildCommentGroups } from "../../src/panels/right/comments/commentModel.js";
import { useRightPanelData } from "../../src/shell/rightPanel/useRightPanelData.js";
import { makeProse, resetStore } from "../cards/_helpers.js";

const TARGET = makeProse("2026-05-22T10:00:00Z_doc", "us-a7f3", {
  content: "Redesign the sessions list",
  name: "Recommendation",
});

/* A comment/reply anchored to TARGET (line 7 by default). Agents post replies
   with `in_reply_to` set to the *specific* message they answer, so a reply to a
   reply nests rather than pointing at the root. */
function comment(
  ordinal: string,
  who: string,
  content: string,
  opts: { inReplyTo?: string; line?: number } = {},
): AnyEventRecord {
  const line = opts.line ?? 7;
  return makeProse(`2026-05-22T10:00:${ordinal}Z_${content}`, who, {
    content,
    append_to: TARGET.filename,
    mode: "comment",
    lines: [line, line],
    ...(opts.inReplyTo === undefined ? {} : { in_reply_to: opts.inReplyTo }),
  });
}

afterEach(() => {
  cleanup();
});

describe("comment threading — nested replies", () => {
  test("a reply chain (reply → reply → reply) all threads under the root", () => {
    const root = comment("01", "us-a7f3", "why");
    const r1 = comment("02", "ag-c92e", "because", { inReplyTo: root.filename });
    // r2 answers r1 (nested), r3 answers r2 (deeper) — how agents actually reply.
    const r2 = comment("03", "us-a7f3", "explain", { inReplyTo: r1.filename });
    const r3 = comment("04", "ag-c92e", "yepp", { inReplyTo: r2.filename });

    const groups = buildCommentGroups([TARGET, root, r1, r2, r3]);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.roots).toHaveLength(1);
    const replies = groups[0]!.roots[0]!.replies.map((r) => r.filename);
    expect(replies).toEqual(
      expect.arrayContaining([r1.filename, r2.filename, r3.filename]),
    );
  });

  test("a live reply whose middle parent was removed still attaches to the root", () => {
    const root = comment("01", "us-a7f3", "why");
    const middle = comment("02", "ag-c92e", "middle", { inReplyTo: root.filename });
    const child = comment("03", "us-a7f3", "child", { inReplyTo: middle.filename });
    // Removal marker for the middle reply (supersedes it with "_removed_").
    const removeMiddle = makeProse("2026-05-22T10:00:04Z_rm", "us-a7f3", {
      content: "_removed_",
      supersedes: middle.filename,
      append_to: TARGET.filename,
      mode: "comment",
      lines: [7, 7],
    });

    const groups = buildCommentGroups([TARGET, root, middle, child, removeMiddle]);

    const replies = groups[0]!.roots[0]!.replies.map((r) => r.filename);
    expect(replies).toContain(child.filename); // child survives its removed parent
    expect(replies).not.toContain(middle.filename); // the removed middle is gone
  });

  test("a reply whose in_reply_to points at a missing comment stays orphaned", () => {
    const root = comment("01", "us-a7f3", "why");
    const orphan = comment("02", "ag-c92e", "ghostreply", {
      inReplyTo: "2026-05-22T09:00:00Z_missing",
    });

    const groups = buildCommentGroups([TARGET, root, orphan]);

    // The orphan must not graft onto the unrelated root.
    const replies = groups[0]!.roots.flatMap((node) => node.replies);
    expect(replies).toHaveLength(0);
  });
});

describe("comments tab count — reflects threads, not comments", () => {
  test("one thread with several comments counts as 1", () => {
    const root = comment("01", "us-a7f3", "why");
    const r1 = comment("02", "ag-c92e", "because", { inReplyTo: root.filename });
    const r2 = comment("03", "ag-c92e", "yepp", { inReplyTo: r1.filename });
    resetStore({ events: [TARGET, root, r1, r2] });

    const { result } = renderHook(() => useRightPanelData());

    expect(result.current.tabCounts.comments).toBe(1);
  });
});
