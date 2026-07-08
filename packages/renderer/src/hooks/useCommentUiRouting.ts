import { useMemo } from "react";
import {
  isCommentsPanelAvailable,
  resolveCommentTabsConfig,
  shouldUseInlineCommentThread,
} from "../comments/commentUiRouting.js";
import { useDockLayout } from "./useDockLayout.js";
import { useStore } from "../state/store.js";

export function useCommentUiRouting(): {
  useInline: boolean;
  commentsPanelAvailable: boolean;
} {
  const commentTarget = useStore((s) => s.commentTarget);
  const rightTab = useStore((s) => s.rightTab);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const globalConfig = useStore((s) => s.rightTabsConfig);
  const bySession = useStore((s) => s.rightTabsConfigBySession);
  const layout = useDockLayout();
  const tabsConfig = resolveCommentTabsConfig({
    global: globalConfig,
    bySession,
    sessionId: currentSessionId,
  });
  const rightPanes = layout.areas.right;

  return useMemo(() => {
    const routing = { commentTarget, rightTab, rightPanes, tabsConfig };
    return {
      useInline: shouldUseInlineCommentThread(routing),
      commentsPanelAvailable: isCommentsPanelAvailable(routing),
    };
  }, [commentTarget, rightTab, rightPanes, tabsConfig]);
}
