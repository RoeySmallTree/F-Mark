import { useState, type DragEvent } from "react";
import { useDockLayout } from "../../hooks/useDockLayout.js";
import { useDockPaneDrag } from "../../hooks/useDockPaneDrag.js";
import {
  applyDockLayout,
  clearDockPaneDrag,
  dockPaneFromDataTransfer,
  DOCK_META,
  hasDockPaneDrag,
  moveDockPane,
  setDockActive,
  writeDockPaneData,
  type DockPaneId,
} from "../dockLayout.js";
import { isLeavingDropContainer } from "../dockDragEvents.js";
import { ViewModeToggle } from "./ViewModeToggle.js";

const NO_LOOSE_STRING_VALUES = {
  center: "center",
  messages: "messages",
  move: "move",
} as const;

export function CenterDockTabs(): JSX.Element | null {
  const layout = useDockLayout();
  const draggedPane = useDockPaneDrag();
  const [dropBefore, setDropBefore] = useState<DockPaneId | null>(null);
  const centerPanes = layout.areas.center;
  const active =
    layout.active.center !== undefined &&
    centerPanes.includes(layout.active.center)
      ? layout.active.center
      : centerPanes[0];

  function moveHere(pane: DockPaneId, beforePane?: DockPaneId): void {
    applyDockLayout(
      moveDockPane(layout, pane, NO_LOOSE_STRING_VALUES.center, beforePane),
    );
  }

  function activate(pane: DockPaneId): void {
    applyDockLayout(setDockActive(layout, NO_LOOSE_STRING_VALUES.center, pane));
  }

  function onDrop(e: DragEvent<HTMLElement>, beforePane?: DockPaneId): void {
    if (!hasDockPaneDrag(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    const pane = dockPaneFromDataTransfer(e.dataTransfer);
    if (pane !== null) moveHere(pane, beforePane);
    setDropBefore(null);
    clearDockPaneDrag();
  }

  function onTabDragOver(
    e: DragEvent<HTMLButtonElement>,
    pane: DockPaneId,
  ): void {
    if (!hasDockPaneDrag(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = NO_LOOSE_STRING_VALUES.move;
    if (dropBefore !== pane) setDropBefore(pane);
  }

  if (centerPanes.length === 0) return null;

  return (
    <div
      className="center-dock-top-tabs"
      role="tablist"
      aria-label="Center pane tabs"
      onDragOver={(e) => {
        if (!hasDockPaneDrag(e.dataTransfer)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = NO_LOOSE_STRING_VALUES.move;
      }}
      onDragLeave={(e) => {
        if (isLeavingDropContainer(e)) setDropBefore(null);
      }}
      onDrop={(e) => onDrop(e)}
    >
      {centerPanes.map((pane) => {
        const meta = DOCK_META[pane];
        const isActive = active === pane;
        const tab = (
          <button
            key={pane}
            type="button"
            role="tab"
            data-pane={pane}
            data-drop-before={
              dropBefore === pane && draggedPane !== pane ? "true" : undefined
            }
            aria-selected={isActive}
            className={`center-dock-tab-button${isActive ? " active" : ""}`}
            draggable
            onClick={() => activate(pane)}
            onDragStart={(e) =>
              writeDockPaneData(e.dataTransfer, pane, e.currentTarget)
            }
            onDragEnd={() => {
              setDropBefore(null);
              clearDockPaneDrag();
            }}
            onDragOver={(e) => onTabDragOver(e, pane)}
            onDrop={(e) => onDrop(e, pane)}
          >
            {meta.icon}
            <span>{meta.short}</span>
          </button>
        );
        if (pane !== NO_LOOSE_STRING_VALUES.messages || !isActive) return tab;
        return (
          <div
            key={pane}
            className="center-dock-tab-bundle active"
            role="presentation"
          >
            {tab}
            <ViewModeToggle />
          </div>
        );
      })}
    </div>
  );
}
