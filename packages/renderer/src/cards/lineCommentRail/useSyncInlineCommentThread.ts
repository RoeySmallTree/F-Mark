import { useCallback, useEffect } from "react";
import { useCommentUiRouting } from "../../hooks/useCommentUiRouting.js";
import { RIGHT_TAB_IDS } from "../../state/rightTabsConfig.js";
import { useStore } from "../../state/store.js";
import type { LineRange } from "./lineGeometry.js";
import type { useInlineThreadPopover } from "./useInlineThreadPopover.js";

type InlineThread = ReturnType<typeof useInlineThreadPopover>;

export function useSyncInlineCommentThread(
  thread: InlineThread,
  matchesActiveTarget: () => boolean,
  activeLines: () => LineRange | null,
  setCommentFocus: (lines: LineRange) => void,
): { openThread(lines: LineRange): void; useInline: boolean } {
  const { useInline, commentsPanelAvailable } = useCommentUiRouting();
  const setRightTab = useStore((s) => s.setRightTab);
  const commentTarget = useStore((s) => s.commentTarget);
  const rightTab = useStore((s) => s.rightTab);
  const { openThread: openInlineThread, closeThread } = thread;

  const openThread = useCallback(
    (lines: LineRange): void => {
      setCommentFocus(lines);
      if (commentsPanelAvailable) {
        setRightTab(RIGHT_TAB_IDS.comments);
        closeThread();
        return;
      }
      openInlineThread(lines);
    },
    [
      closeThread,
      commentsPanelAvailable,
      openInlineThread,
      setCommentFocus,
      setRightTab,
    ],
  );

  useEffect(() => {
    if (!useInline) {
      closeThread();
      return;
    }
    if (!matchesActiveTarget()) {
      closeThread();
      return;
    }
    const lines = activeLines();
    if (lines === null) return;
    openInlineThread(lines);
  }, [
    activeLines,
    closeThread,
    commentTarget,
    matchesActiveTarget,
    openInlineThread,
    rightTab,
    useInline,
  ]);

  return { openThread, useInline };
}
