import type { CommentTarget } from "../state/storeTypes.js";
import {
  resolveRightTabsConfig,
  RIGHT_TAB_IDS,
  type RightTabConfig,
  type RightPanelView,
} from "../state/rightTabsConfig.js";
import type { DockPaneId } from "../shell/dockLayout.js";

const COMMENT_TARGET_KINDS = {
  event: "event",
} as const;

export function isCommentsTabEnabled(config: RightTabConfig): boolean {
  return (
    config.find((entry) => entry.key === RIGHT_TAB_IDS.comments)?.enabled ===
    true
  );
}

export function isCommentsPaneDocked(
  rightPanes: readonly DockPaneId[],
): boolean {
  return rightPanes.includes(RIGHT_TAB_IDS.comments);
}

export function commentTargetKey(target: CommentTarget | null): string | null {
  if (target === null) return null;
  if (target.kind === COMMENT_TARGET_KINDS.event) {
    const lines = target.lines;
    return `event:${target.file}:${lines?.[0] ?? ""}:${lines?.[1] ?? ""}`;
  }
  const lines = target.lines;
  return `file:${target.file_path}:${lines?.[0] ?? ""}:${lines?.[1] ?? ""}:${target.diff_hunk ?? ""}:${target.diff_base ?? ""}`;
}

export interface CommentUiRoutingInput {
  commentTarget: CommentTarget | null;
  rightTab: RightPanelView;
  rightPanes: readonly DockPaneId[];
  tabsConfig: RightTabConfig;
}

/** Inline thread UI is a fallback when the Comments tab is unavailable, or when
    the user navigated away from Comments while a thread stays focused. */
export function shouldUseInlineCommentThread(
  input: CommentUiRoutingInput,
): boolean {
  if (!isCommentsTabEnabled(input.tabsConfig)) return true;
  if (!isCommentsPaneDocked(input.rightPanes)) return true;
  if (input.commentTarget === null) return false;
  return input.rightTab !== RIGHT_TAB_IDS.comments;
}

export function isCommentsPanelAvailable(
  input: Pick<CommentUiRoutingInput, "rightPanes" | "tabsConfig">,
): boolean {
  return (
    isCommentsTabEnabled(input.tabsConfig) &&
    isCommentsPaneDocked(input.rightPanes)
  );
}

export function resolveCommentTabsConfig(input: {
  global: RightTabConfig;
  bySession: Record<string, RightTabConfig>;
  sessionId: string | null;
}): RightTabConfig {
  return resolveRightTabsConfig(
    input.global,
    input.bySession,
    input.sessionId,
  );
}
