import { type JSX } from "react";
import { useShellPlacement } from "../hooks/useShellPlacement.js";
import { paneGeometry } from "../themes/layout.js";
import {
  useActiveTabAutoCenter,
  useCommentTargetTabSwitch,
  useDisabledTabFallback,
} from "./rightPanel/useRightPanelEffects.js";
import { useRightPanelData } from "./rightPanel/useRightPanelData.js";
import { useRightPanelDockController } from "./rightPanel/useRightPanelDockController.js";
import { useRightPanelScroll } from "./rightPanel/useRightPanelScroll.js";
import { RightPanelView } from "./rightPanel/RightPanelView.js";

const NO_LOOSE_STRING_VALUES = {
  rightpanel: "rightPanel",
} as const;

export function RightPanel(): JSX.Element {
  const data = useRightPanelData();
  const dock = useRightPanelDockController(data.rightTab, data.setRightTab);
  const borderEdge = paneGeometry(useShellPlacement(), NO_LOOSE_STRING_VALUES.rightpanel)?.edge;
  const scroll = useRightPanelScroll(
    data.currentSessionId,
    dock.activePane,
    data.scrollMap,
    data.setRightScroll,
  );
  useCommentTargetTabSwitch(
    data.commentTarget,
    dock.rightPanes,
    dock.selectTab,
  );
  useDisabledTabFallback(data.rightTab, dock.rightPanes, data.setRightTab);
  useActiveTabAutoCenter(dock.activePane, dock.tabsRef);

  return (
    <RightPanelView
      activePath={data.activePath}
      borderEdge={borderEdge}
      dock={dock}
      onPanelScroll={scroll.onPanelScroll}
      scrollRef={scroll.scrollRef}
      slug={data.slug}
      tabCounts={data.tabCounts}
    />
  );
}
