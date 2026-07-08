import { type JSX, type RefObject, type UIEvent } from "react";
import type { RightTabKey } from "../../state/store.js";
import { PaneResizer } from "../../components/PaneResizer.js";
import { RightLayout } from "../../panels/right/RightLayout.js";
import { DockPaneContent } from "../DockPaneContent.js";
import type { RightPanelDockController } from "./useRightPanelDockController.js";
import { RightPanelScope } from "./RightPanelScope.js";
import { RightPanelTabs } from "./RightPanelTabs.js";

const NO_LOOSE_STRING_VALUES = {
  rightpanel: "rightPanel",
  layout: "layout",
} as const;

interface Props {
  activePath: string | null;
  borderEdge: string | undefined;
  dock: RightPanelDockController;
  onPanelScroll(event: UIEvent<HTMLDivElement>): void;
  scrollRef: RefObject<HTMLDivElement>;
  slug: string;
  tabCounts: Partial<Record<RightTabKey, number>>;
}

export function RightPanelView({
  activePath,
  borderEdge,
  dock,
  onPanelScroll,
  scrollRef,
  slug,
  tabCounts,
}: Props): JSX.Element {
  return (
    <aside
      className={`right-panel${dock.dropOver ? " is-drop-over" : ""}`}
      aria-label="Right panel"
      data-border-edge={borderEdge}
      onDragEnter={dock.onPanelDragEnter}
      onDragOver={dock.onPanelDragOver}
      onDragLeave={dock.onPanelDragLeave}
      onDrop={dock.onPanelDrop}
    >
      <PaneResizer pane={NO_LOOSE_STRING_VALUES.rightpanel} />
      <div className="dock-drop-overlay" aria-hidden="true">
        <span>Drop to place</span>
        <small>Right pane</small>
      </div>
      <RightPanelTabs counts={tabCounts} dock={dock} />
      <RightPanelScope
        activePane={dock.activePane}
        activePath={activePath}
        slug={slug}
      />
      <div ref={scrollRef} className="panel-scroll" onScroll={onPanelScroll}>
        {dock.activePane === NO_LOOSE_STRING_VALUES.layout ? (
          <RightLayout />
        ) : (
          <DockPaneContent pane={dock.activePane} />
        )}
      </div>
    </aside>
  );
}
