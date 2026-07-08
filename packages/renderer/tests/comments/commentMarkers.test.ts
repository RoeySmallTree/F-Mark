import { describe, expect, test } from "vitest";
import { makeProse } from "../cards/_helpers.js";
import {
  COMMENT_MARKER_CONTENT,
  isMarkerEvent,
  isThreadResolved,
  resolvedChainRootsFromComments,
  createChainRootResolver,
} from "../../src/comments/commentMarkers.js";
import { buildFileCommentAnchors } from "../../src/panels/fileViewer/lineComment/renderedRail/commentAnchors.js";

describe("commentMarkers — resolution state", () => {
  test("isThreadResolved is false with no markers", () => {
    const root = makeProse("20260522T120100Z_us-a7f3.prose.md", "us-a7f3", {
      content: "Root",
      append_to: "x",
      mode: "comment",
    });
    expect(isThreadResolved([root], root.filename)).toBe(false);
  });

  test("isThreadResolved is true after a resolve marker", () => {
    const root = makeProse("20260522T120100Z_us-a7f3.prose.md", "us-a7f3", {
      content: "Root",
      append_to: "x",
      mode: "comment",
    });
    const resolved = makeProse("20260522T120200Z_us-a7f3.prose.md", "us-a7f3", {
      content: COMMENT_MARKER_CONTENT.resolved,
      append_to: "x",
      mode: "comment",
      supersedes: root.filename,
    });
    expect(isThreadResolved([root, resolved], root.filename)).toBe(true);
  });

  test("unresolve marker reopens a resolved thread (last wins)", () => {
    const root = makeProse("20260522T120100Z_us-a7f3.prose.md", "us-a7f3", {
      content: "Root",
      append_to: "x",
      mode: "comment",
    });
    const resolved = makeProse("20260522T120200Z_us-a7f3.prose.md", "us-a7f3", {
      content: COMMENT_MARKER_CONTENT.resolved,
      append_to: "x",
      mode: "comment",
      supersedes: root.filename,
    });
    const unresolved = makeProse("20260522T120300Z_us-a7f3.prose.md", "us-a7f3", {
      content: COMMENT_MARKER_CONTENT.unresolved,
      append_to: "x",
      mode: "comment",
      supersedes: root.filename,
    });
    expect(
      isThreadResolved([root, resolved, unresolved], root.filename),
    ).toBe(false);
  });

  test("resolve after unresolve closes the thread again", () => {
    const root = makeProse("20260522T120100Z_us-a7f3.prose.md", "us-a7f3", {
      content: "Root",
      append_to: "x",
      mode: "comment",
    });
    const resolved = makeProse("20260522T120200Z_us-a7f3.prose.md", "us-a7f3", {
      content: COMMENT_MARKER_CONTENT.resolved,
      append_to: "x",
      mode: "comment",
      supersedes: root.filename,
    });
    const unresolved = makeProse("20260522T120300Z_us-a7f3.prose.md", "us-a7f3", {
      content: COMMENT_MARKER_CONTENT.unresolved,
      append_to: "x",
      mode: "comment",
      supersedes: root.filename,
    });
    const resolvedAgain = makeProse(
      "20260522T120400Z_us-a7f3.prose.md",
      "us-a7f3",
      {
        content: COMMENT_MARKER_CONTENT.resolved,
        append_to: "x",
        mode: "comment",
        supersedes: root.filename,
      },
    );
    expect(
      isThreadResolved(
        [root, resolved, unresolved, resolvedAgain],
        root.filename,
      ),
    ).toBe(true);
  });

  test("resolvedChainRootsFromComments tracks multiple roots independently", () => {
    const rootA = makeProse("20260522T120100Z_us-a7f3.prose.md", "us-a7f3", {
      content: "A",
      append_to: "x",
      mode: "comment",
    });
    const rootB = makeProse("20260522T120110Z_us-a7f3.prose.md", "us-a7f3", {
      content: "B",
      append_to: "x",
      mode: "comment",
    });
    const resolveA = makeProse("20260522T120200Z_us-a7f3.prose.md", "us-a7f3", {
      content: COMMENT_MARKER_CONTENT.resolved,
      append_to: "x",
      mode: "comment",
      supersedes: rootA.filename,
    });
    const byFilename = new Map(
      [rootA, rootB, resolveA].map((event) => [event.filename, event]),
    );
    const chainRoot = createChainRootResolver(byFilename);
    const roots = resolvedChainRootsFromComments(
      [rootA, rootB, resolveA],
      chainRoot,
    );
    expect(roots.has(rootA.filename)).toBe(true);
    expect(roots.has(rootB.filename)).toBe(false);
  });

  test("isMarkerEvent does not throw on non-prose events", () => {
    const fileEvent = {
      filename: "20260522T120000Z_us-a7f3.prose.md",
      timestamp: "20260522T120000Z",
      participant_id: "us-a7f3",
      kind: "file",
      payload: { path: "src/a.ts" },
    };
    expect(() => isMarkerEvent(fileEvent as never)).not.toThrow();
    expect(isMarkerEvent(fileEvent as never)).toBe(false);
  });

  test("buildFileCommentAnchors tolerates mixed session events", () => {
    const comment = makeProse("20260522T120100Z_us-a7f3.prose.md", "us-a7f3", {
      content: "note",
      file_path: "src/a.ts",
      lines: [1, 1],
    });
    const fileEvent = {
      filename: "20260522T120200Z_us-a7f3.file",
      timestamp: "20260522T120200Z",
      participant_id: "us-a7f3",
      kind: "file",
      payload: { path: "src/a.ts" },
    };
    expect(() =>
      buildFileCommentAnchors({
        events: [comment, fileEvent as never],
        scopedPath: "src/a.ts",
        lineCount: 10,
      }),
    ).not.toThrow();
  });
});
