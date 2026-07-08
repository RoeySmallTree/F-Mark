import { useState, type DragEvent } from "react";
import { useDockLayout } from "../../hooks/useDockLayout.js";
import { useDockPaneDrag } from "../../hooks/useDockPaneDrag.js";
import { isLeavingDropContainer } from "../dockDragEvents.js";
import {
  applyDockLayout,
  clearDockPaneDrag,
  dockPaneFromDataTransfer,
  hasDockPaneDrag,
  moveDockPane,
  setDockActive,
  writeDockPaneData,
  type DockPaneId,
} from "../dockLayout.js";
import type { DockAreaController, DockAreaName } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  move: "move",
} as const;

export function useDockAreaController({
  area,
  onActivate,
}: {
  area: DockAreaName;
  onActivate?: (pane: DockPaneId) => void;
}): DockAreaController {
  const layout = useDockLayout();
  const draggedPane = useDockPaneDrag();
  const [dropOver, setDropOver] = useState(false);
  const [dropBefore, setDropBefore] = useState<DockPaneId | null>(null);
  const panes = layout.areas[area];
  const active = resolveActivePane(panes, layout.active[area]);

  function resetDropState(): void {
    setDropOver(false);
    setDropBefore(null);
  }

  function activate(pane: DockPaneId): void {
    applyDockLayout(setDockActive(layout, area, pane));
    onActivate?.(pane);
  }

  function moveHere(pane: DockPaneId, beforePane?: DockPaneId): void {
    applyDockLayout(moveDockPane(layout, pane, area, beforePane));
    onActivate?.(pane);
  }

  return {
    active,
    draggedPane,
    dropBefore,
    dropOver,
    panes,
    activate,
    onAreaDragEnter: (event) => {
      if (hasDockPaneDrag(event.dataTransfer)) setDropOver(true);
    },
    onAreaDragLeave: (event) => {
      if (isLeavingDropContainer(event)) resetDropState();
    },
    onAreaDragOver: (event) => {
      if (!hasDockPaneDrag(event.dataTransfer)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = NO_LOOSE_STRING_VALUES.move;
      setDropOver(true);
      setDropBefore(null);
    },
    onAreaDrop: (event) => {
      if (!hasDockPaneDrag(event.dataTransfer)) return;
      event.preventDefault();
      resetDropState();
      const pane = payloadFromEvent(event);
      if (pane !== null) moveHere(pane);
      clearDockPaneDrag();
    },
    onTabDragEnd: clearDockPaneDrag,
    onTabDragLeave: (event, pane) => {
      if (dropBefore === pane && isLeavingDropContainer(event)) {
        setDropBefore(null);
      }
    },
    onTabDragOver: (event, pane) => {
      if (!hasDockPaneDrag(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = NO_LOOSE_STRING_VALUES.move;
      setDropOver(true);
      if (dropBefore !== pane) setDropBefore(pane);
    },
    onTabDragStart: (event, pane) => {
      writeDockPaneData(event.dataTransfer, pane, event.currentTarget);
    },
    onTabDrop: (event, pane) => {
      if (!hasDockPaneDrag(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();
      resetDropState();
      const dragged = payloadFromEvent(event);
      if (dragged !== null) moveHere(dragged, pane);
      clearDockPaneDrag();
    },
  };
}

function payloadFromEvent(event: DragEvent<HTMLElement>): DockPaneId | null {
  return dockPaneFromDataTransfer(event.dataTransfer);
}

function resolveActivePane(
  panes: DockPaneId[],
  active: DockPaneId | undefined,
): DockPaneId | undefined {
  return active !== undefined && panes.includes(active) ? active : panes[0];
}
