import { useLayoutEffect, useRef } from "react";
import { useStore } from "../state/store.js";
import { PaneResizer } from "../components/PaneResizer.js";
import { useShellPlacement } from "../hooks/useShellPlacement.js";
import { paneGeometry } from "../themes/layout.js";
import { useDockLayout } from "../hooks/useDockLayout.js";
import { DockAreaView } from "./DockAreaView.js";
import {
  applyDockLayout,
  hasStoredDockLayout,
  moveDockPane,
  type DockPaneId,
} from "./dockLayout.js";

const NO_LOOSE_STRING_VALUES = {
  leftpanel: "leftPanel",
  sessions: "sessions",
  left: "left",
} as const;

export function LeftPanel(): JSX.Element {
  const leftRail = useStore((s) => s.leftRail);
  const layout = useDockLayout();
  const previousLeftRailRef = useRef(leftRail);
  const initializedRef = useRef(false);
  /* Divider side faces chat/another pane (same edge the resizer grabs); CSS
     keys `.left-panel[data-border-edge]` off it. */
  const borderEdge = paneGeometry(useShellPlacement(), NO_LOOSE_STRING_VALUES.leftpanel)?.edge;

  useLayoutEffect(() => {
    const firstRun = !initializedRef.current;
    initializedRef.current = true;
    if (firstRun && hasStoredDockLayout() && leftRail === NO_LOOSE_STRING_VALUES.sessions) return;
    if (!firstRun && previousLeftRailRef.current === leftRail) return;
    previousLeftRailRef.current = leftRail;
    applyDockLayout(moveDockPane(layout, leftRail as DockPaneId, NO_LOOSE_STRING_VALUES.left));
  }, [layout, leftRail]);

  return (
    <div className="left-panel-host" data-border-edge={borderEdge}>
      <DockAreaView
        area={NO_LOOSE_STRING_VALUES.left}
        label="Left pane tabs"
        tabsClassName="dock-tabs left-dock-tabs"
        contentClassName="left-dock-content"
        alwaysShowTabs
      />
      <PaneResizer pane={NO_LOOSE_STRING_VALUES.leftpanel} />
    </div>
  );
}
