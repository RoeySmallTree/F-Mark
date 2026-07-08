import { describe, expect, test } from "vitest";
import {
  commentTargetKey,
  isCommentsPanelAvailable,
  shouldUseInlineCommentThread,
} from "../../src/comments/commentUiRouting.js";
import { DEFAULT_RIGHT_TABS_CONFIG } from "../../src/state/rightTabsConfig.js";

const ALL_RIGHT_PANES = [
  "todos",
  "comments",
  "named",
  "agents",
  "log",
  "files",
  "diffTree",
  "terminal",
] as const;

describe("commentUiRouting", () => {
  test("uses comments panel when docked and tab is comments", () => {
    expect(
      shouldUseInlineCommentThread({
        commentTarget: {
          kind: "file",
          file_path: "src/a.ts",
          lines: [2, 2],
        },
        rightTab: "comments",
        rightPanes: [...ALL_RIGHT_PANES],
        tabsConfig: DEFAULT_RIGHT_TABS_CONFIG,
      }),
    ).toBe(false);
  });

  test("uses inline when comments tab is disabled", () => {
    const tabsConfig = DEFAULT_RIGHT_TABS_CONFIG.map((entry) =>
      entry.key === "comments" ? { ...entry, enabled: false } : entry,
    );
    expect(
      shouldUseInlineCommentThread({
        commentTarget: {
          kind: "file",
          file_path: "src/a.ts",
          lines: [2, 2],
        },
        rightTab: "comments",
        rightPanes: [...ALL_RIGHT_PANES],
        tabsConfig,
      }),
    ).toBe(true);
  });

  test("uses inline when user navigates away from comments while focused", () => {
    expect(
      shouldUseInlineCommentThread({
        commentTarget: {
          kind: "event",
          file: "evt.md",
          lines: [1, 1],
        },
        rightTab: "log",
        rightPanes: [...ALL_RIGHT_PANES],
        tabsConfig: DEFAULT_RIGHT_TABS_CONFIG,
      }),
    ).toBe(true);
  });

  test("does not use inline when no comment is focused", () => {
    expect(
      shouldUseInlineCommentThread({
        commentTarget: null,
        rightTab: "log",
        rightPanes: [...ALL_RIGHT_PANES],
        tabsConfig: DEFAULT_RIGHT_TABS_CONFIG,
      }),
    ).toBe(false);
  });

  test("comments panel unavailable when pane undocked", () => {
    expect(
      isCommentsPanelAvailable({
        rightPanes: ["log", "files"],
        tabsConfig: DEFAULT_RIGHT_TABS_CONFIG,
      }),
    ).toBe(false);
  });

  test("commentTargetKey is stable for the same target", () => {
    const target = {
      kind: "file" as const,
      file_path: "src/a.ts",
      lines: [2, 2] as [number, number],
    };
    expect(commentTargetKey(target)).toBe(commentTargetKey({ ...target }));
  });
});
