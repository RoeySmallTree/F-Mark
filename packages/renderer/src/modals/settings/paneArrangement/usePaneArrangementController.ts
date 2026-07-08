import {
  useRef,
  useState,
  type DragEvent,
} from "react";
import {
  applyDockLayout,
  clearDockPaneDrag,
  dockPaneFromDataTransfer,
  moveDockPane,
  resetDockLayout,
  setDockActive,
  writeDockPaneData,
  type DockArea,
  type DockPaneId,
} from "../../../shell/dockLayout.js";
import { useDockLayout } from "../../../hooks/useDockLayout.js";
import { useStore } from "../../../state/store.js";
import {
  isLeftRailKey,
  isRightTabKey,
  type BoardArea,
} from "./model.js";

const NO_LOOSE_STRING_VALUES = {
  left: "left",
  right: "right",
  sessions: "sessions",
  log: "log",
} as const;

export function usePaneArrangementController() {
  const layout = useDockLayout();
  const setLeftRail = useStore((s) => s.setLeftRail);
  const setRightTab = useStore((s) => s.setRightTab);
  const [dropArea, setDropArea] = useState<DockArea | null>(null);
  const dragPaneRef = useRef<DockPaneId | null>(null);

  function syncLegacySelection(area: DockArea, pane: DockPaneId): void {
    if (area === NO_LOOSE_STRING_VALUES.left && isLeftRailKey(pane)) setLeftRail(pane);
    if (area === NO_LOOSE_STRING_VALUES.right && isRightTabKey(pane)) setRightTab(pane);
  }

  function readPane(e: DragEvent<HTMLElement>): DockPaneId | null {
    return dockPaneFromDataTransfer(e.dataTransfer) ?? dragPaneRef.current;
  }

  function startDrag(e: DragEvent<HTMLElement>, pane: DockPaneId): void {
    dragPaneRef.current = pane;
    writeDockPaneData(e.dataTransfer, pane, e.currentTarget, {
      globalDropHints: false,
    });
  }

  function endDrag(): void {
    dragPaneRef.current = null;
    setDropArea(null);
    clearDockPaneDrag();
  }

  function movePane(
    pane: DockPaneId,
    area: DockArea,
    beforePane?: DockPaneId,
  ): void {
    applyDockLayout(moveDockPane(layout, pane, area, beforePane));
    syncLegacySelection(area, pane);
  }

  function activatePane(area: BoardArea, pane: DockPaneId): void {
    applyDockLayout(setDockActive(layout, area, pane));
    syncLegacySelection(area, pane);
  }

  function onDropArea(e: DragEvent<HTMLElement>, area: DockArea): void {
    e.preventDefault();
    const pane = readPane(e);
    setDropArea(null);
    if (pane !== null) movePane(pane, area);
  }

  function onDropPane(
    e: DragEvent<HTMLElement>,
    area: DockArea,
    targetPane: DockPaneId,
  ): void {
    e.preventDefault();
    e.stopPropagation();
    const pane = readPane(e);
    setDropArea(null);
    if (pane !== null) movePane(pane, area, targetPane);
  }

  function reset(): void {
    resetDockLayout();
    setLeftRail(NO_LOOSE_STRING_VALUES.sessions);
    setRightTab(NO_LOOSE_STRING_VALUES.log);
  }

  function clearDropIfLeaving(
    relatedTarget: EventTarget | null,
    currentTarget: HTMLElement,
  ): void {
    const related = relatedTarget as Node | null;
    if (related === null || !currentTarget.contains(related)) setDropArea(null);
  }

  return {
    layout,
    dropArea,
    setDropArea,
    startDrag,
    endDrag,
    movePane,
    activatePane,
    onDropArea,
    onDropPane,
    reset,
    clearDropIfLeaving,
  };
}
