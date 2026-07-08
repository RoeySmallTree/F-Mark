import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import type { CommentTarget, RightTabKey } from "../../state/store.js";
import {
  commentTargetKey,
  isCommentsPanelAvailable,
  resolveCommentTabsConfig,
} from "../../comments/commentUiRouting.js";
import { useStore } from "../../state/store.js";
import { activateDockPaneIfPlaced, type DockPaneId } from "../dockLayout.js";
import { isRightTabKey } from "./tabKeys.js";
import type { RightPanelActivePane } from "./useRightPanelDockController.js";

const NO_LOOSE_STRING_VALUES = {
  comments: "comments",
  layout: "layout",
} as const;

export function useCommentTargetTabSwitch(
  commentTarget: CommentTarget | null,
  rightPanes: DockPaneId[],
  selectTab: (tab: RightPanelActivePane) => void,
): void {
  const prevKeyRef = useRef<string | null>(null);
  const selectTabRef = useRef(selectTab);
  selectTabRef.current = selectTab;
  const tabsConfig = useStore((s) =>
    resolveCommentTabsConfig({
      global: s.rightTabsConfig,
      bySession: s.rightTabsConfigBySession,
      sessionId: s.currentSessionId,
    }),
  );

  useEffect(() => {
    if (commentTarget === null) {
      prevKeyRef.current = null;
      return;
    }
    const key = commentTargetKey(commentTarget);
    const isNewFocus = key !== prevKeyRef.current;
    prevKeyRef.current = key;
    if (!isNewFocus) return;

    if (
      !isCommentsPanelAvailable({ rightPanes, tabsConfig })
    ) {
      activateDockPaneIfPlaced(NO_LOOSE_STRING_VALUES.comments);
      return;
    }
    if (rightPanes.includes(NO_LOOSE_STRING_VALUES.comments)) {
      selectTabRef.current(NO_LOOSE_STRING_VALUES.comments);
    }
  }, [commentTarget, rightPanes, tabsConfig]);
}

export function useDisabledTabFallback(
  rightTab: RightTabKey | "layout",
  rightPanes: DockPaneId[],
  setRightTab: (tab: RightTabKey | "layout") => void,
): void {
  useEffect(() => {
    if (rightTab === NO_LOOSE_STRING_VALUES.layout) return;
    if (rightPanes.includes(rightTab as DockPaneId)) return;
    const fallback = rightPanes.find(isRightTabKey);
    if (fallback !== undefined) setRightTab(fallback);
  }, [rightPanes, rightTab, setRightTab]);
}

export function useActiveTabAutoCenter(
  activePane: RightPanelActivePane,
  tabsRef: RefObject<HTMLDivElement>,
): void {
  useLayoutEffect(() => {
    const container = tabsRef.current;
    if (container === null) return;
    const button = container.querySelector<HTMLButtonElement>(
      `button[data-pane="${activePane}"], button[data-tab="${activePane}"]`,
    );
    if (button === null) return;
    const left =
      container.scrollLeft +
      button.offsetLeft +
      button.offsetWidth / 2 -
      container.clientWidth / 2;
    container.scrollLeft = Math.max(0, left);
  }, [activePane, tabsRef]);
}
