import { useRef, useState, type DragEvent } from "react";
import { useDockLayout } from "../../hooks/useDockLayout.js";
import { useRovingTabIndex } from "../../a11y/useRovingTabIndex.js";
import {
  applyDockLayout,
  clearDockPaneDrag,
  DOCK_META,
  moveDockPane,
  writeDockPaneData,
  type DockArea,
  type DockPaneId,
} from "../dockLayout.js";

const DEFAULT_AREA_BY_PANE: Record<DockPaneId, Exclude<DockArea, "toolbar">> = {
  messages: "center",
  sessions: "left",
  todos: "right",
  comments: "right",
  named: "right",
  agents: "right",
  log: "right",
  files: "right",
  diffTree: "right",
  terminal: "right",
  search: "left",
  filesDisplay: "center",
};

export function ToolbarDockTabs(): JSX.Element | null {
  const layout = useDockLayout();
  const toolbarPanes = layout.areas.toolbar;
  /* Focus-only roving: restorePane() removes the item from this list, so
     automatic activation (arrow = restore, as in ViewModeToggle) would move
     a stowed pane out on every arrow press instead of just moving focus.
     Arrows move the tab stop; Enter/Space/click still restores. */
  const [focusIndex, setFocusIndex] = useState(0);
  const paneRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const clampedFocusIndex = Math.min(
    focusIndex,
    Math.max(toolbarPanes.length - 1, 0),
  );
  const { tabIndexFor, onKeyDown } = useRovingTabIndex(
    toolbarPanes.length,
    clampedFocusIndex,
    (index) => {
      setFocusIndex(index);
      paneRefs.current[index]?.focus();
    },
  );

  function restorePane(pane: DockPaneId): void {
    applyDockLayout(moveDockPane(layout, pane, DEFAULT_AREA_BY_PANE[pane]));
  }

  function startDrag(
    event: DragEvent<HTMLButtonElement>,
    pane: DockPaneId,
  ): void {
    writeDockPaneData(event.dataTransfer, pane, event.currentTarget);
  }

  if (toolbarPanes.length === 0) return null;

  return (
    <div
      className="toolbar-dock-tabs"
      role="tablist"
      aria-label="Stowed pane tabs"
      onKeyDown={onKeyDown}
    >
      {toolbarPanes.map((pane, index) => {
        const meta = DOCK_META[pane];
        return (
          <button
            key={pane}
            ref={(el) => {
              paneRefs.current[index] = el;
            }}
            type="button"
            role="tab"
            data-pane={pane}
            data-dock-area="toolbar"
            aria-label={`${meta.label} pane`}
            aria-selected="false"
            tabIndex={tabIndexFor(index)}
            title={meta.label}
            draggable
            onClick={() => restorePane(pane)}
            onDragStart={(event) => startDrag(event, pane)}
            onDragEnd={clearDockPaneDrag}
          >
            {meta.icon}
          </button>
        );
      })}
    </div>
  );
}
