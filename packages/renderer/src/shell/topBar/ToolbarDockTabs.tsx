import { type DragEvent } from "react";
import { useDockLayout } from "../../hooks/useDockLayout.js";
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
    >
      {toolbarPanes.map((pane) => {
        const meta = DOCK_META[pane];
        return (
          <button
            key={pane}
            type="button"
            role="tab"
            data-pane={pane}
            data-dock-area="toolbar"
            aria-label={`${meta.label} pane`}
            aria-selected="false"
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
