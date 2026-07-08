import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type RefObject,
} from "react";
import type { RightTabKey } from "../../state/store.js";
import { useDockLayout } from "../../hooks/useDockLayout.js";
import { useDockPaneDrag } from "../../hooks/useDockPaneDrag.js";
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
import { isLeavingDropContainer } from "../dockDragEvents.js";
import { isRightTabKey } from "./tabKeys.js";

export type RightPanelActivePane = DockPaneId | "layout";

const rightPanelPaneIds = {
  layout: "layout",
} as const;

const rightPanelDockAreas = {
  right: "right",
} as const;

const dragEffects = {
  move: "move",
} as const;

const scrollBehaviors = {
  smooth: "smooth",
} as const;

export interface RightPanelDockController {
  activePane: RightPanelActivePane;
  draggedPane: DockPaneId | null;
  dropBefore: DockPaneId | null;
  dropOver: boolean;
  rightPanes: DockPaneId[];
  tabsRef: RefObject<HTMLDivElement>;
  movePaneToRight(pane: DockPaneId, beforePane?: DockPaneId): void;
  onPanelDragEnter(event: DragEvent<HTMLElement>): void;
  onPanelDragLeave(event: DragEvent<HTMLElement>): void;
  onPanelDragOver(event: DragEvent<HTMLElement>): void;
  onPanelDrop(event: DragEvent<HTMLElement>): void;
  onTabDragEnd(): void;
  onTabDragOver(event: DragEvent<HTMLButtonElement>, pane: DockPaneId): void;
  onTabDragStart(event: DragEvent<HTMLButtonElement>, pane: DockPaneId): void;
  onTabDrop(event: DragEvent<HTMLButtonElement>, pane: DockPaneId): void;
  onTabsDragLeave(event: DragEvent<HTMLElement>): void;
  onTabsDragOver(event: DragEvent<HTMLElement>): void;
  onTabsDrop(event: DragEvent<HTMLElement>): void;
  selectTab(tab: RightPanelActivePane): void;
}

export function useRightPanelDockController(
  rightTab: RightTabKey | "layout",
  setRightTab: (tab: RightTabKey | "layout") => void,
): RightPanelDockController {
  const tabsRef = useRef<HTMLDivElement>(null);
  const dockLayout = useDockLayout();
  const draggedPane = useDockPaneDrag();
  const [dropOver, setDropOver] = useState(false);
  const [dropBefore, setDropBefore] = useState<DockPaneId | null>(null);
  const [layoutSelected, setLayoutSelected] = useState(
    () => rightTab === rightPanelPaneIds.layout,
  );
  const rightPanes = dockLayout.areas.right;
  const activePane =
    layoutSelected || rightPanes.length === 0
      ? rightPanelPaneIds.layout
      : resolveActivePane(rightTab, rightPanes, dockLayout.active.right);

  useEffect(() => {
    setLayoutSelected(rightTab === rightPanelPaneIds.layout);
  }, [rightTab]);

  const resetDropState = useCallback((): void => {
    setDropOver(false);
    setDropBefore(null);
  }, []);

  const scrollTabIntoCenter = useCallback((tab: RightPanelActivePane): void => {
    const container = tabsRef.current;
    if (container === null) return;
    const button = container.querySelector<HTMLButtonElement>(
      `button[data-pane="${tab}"], button[data-tab="${tab}"]`,
    );
    if (button === null) return;
    centerTabButton(container, button);
  }, []);

  const selectTab = useCallback(
    (tab: RightPanelActivePane): void => {
      if (tab === rightPanelPaneIds.layout) {
        setLayoutSelected(true);
        setRightTab(rightPanelPaneIds.layout);
      } else {
        setLayoutSelected(false);
        applyDockLayout(setDockActive(dockLayout, rightPanelDockAreas.right, tab));
        if (isRightTabKey(tab)) setRightTab(tab);
      }
      scrollTabIntoCenter(tab);
    },
    [dockLayout, scrollTabIntoCenter, setRightTab],
  );

  const movePaneToRight = useCallback(
    (pane: DockPaneId, beforePane?: DockPaneId): void => {
      setLayoutSelected(false);
      applyDockLayout(
        moveDockPane(dockLayout, pane, rightPanelDockAreas.right, beforePane),
      );
      if (isRightTabKey(pane)) setRightTab(pane);
      scrollTabIntoCenter(pane);
    },
    [dockLayout, scrollTabIntoCenter, setRightTab],
  );

  return {
    activePane,
    draggedPane,
    dropBefore,
    dropOver,
    rightPanes,
    tabsRef,
    movePaneToRight,
    onPanelDragEnter: (event) => {
      if (hasDockPaneDrag(event.dataTransfer)) setDropOver(true);
    },
    onPanelDragLeave: (event) => {
      if (isLeavingDropContainer(event)) resetDropState();
    },
    onPanelDragOver: (event) => {
      if (!hasDockPaneDrag(event.dataTransfer)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = dragEffects.move;
      setDropOver(true);
      setDropBefore(null);
    },
    onPanelDrop: (event) => {
      if (!hasDockPaneDrag(event.dataTransfer)) return;
      event.preventDefault();
      const pane = dockPaneFromDataTransfer(event.dataTransfer);
      resetDropState();
      if (pane !== null) movePaneToRight(pane);
      clearDockPaneDrag();
    },
    onTabDragEnd: () => {
      resetDropState();
      clearDockPaneDrag();
    },
    onTabDragOver: (event, pane) => {
      if (!hasDockPaneDrag(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = dragEffects.move;
      if (dropBefore !== pane) setDropBefore(pane);
      setDropOver(true);
    },
    onTabDragStart: (event, pane) => {
      writeDockPaneData(event.dataTransfer, pane, event.currentTarget);
    },
    onTabDrop: (event, pane) => {
      if (!hasDockPaneDrag(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();
      const dragged = dockPaneFromDataTransfer(event.dataTransfer);
      if (dragged !== null) movePaneToRight(dragged, pane);
      resetDropState();
      clearDockPaneDrag();
    },
    onTabsDragLeave: (event) => {
      if (isLeavingDropContainer(event)) setDropBefore(null);
    },
    onTabsDragOver: (event) => {
      if (!hasDockPaneDrag(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = dragEffects.move;
    },
    onTabsDrop: (event) => {
      if (!hasDockPaneDrag(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();
      const pane = dockPaneFromDataTransfer(event.dataTransfer);
      if (pane !== null) movePaneToRight(pane);
      resetDropState();
      clearDockPaneDrag();
    },
    selectTab,
  };
}

function resolveActivePane(
  rightTab: RightTabKey | "layout",
  rightPanes: DockPaneId[],
  dockActiveRight: DockPaneId | undefined,
): RightPanelActivePane {
  if (dockActiveRight !== undefined && rightPanes.includes(dockActiveRight)) {
    return dockActiveRight;
  }
  if (rightPanes.includes(rightTab as DockPaneId)) return rightTab as DockPaneId;
  return rightPanes[0] ?? rightPanelPaneIds.layout;
}

function centerTabButton(container: HTMLDivElement, button: HTMLButtonElement): void {
  const containerRect = container.getBoundingClientRect();
  const buttonRect = button.getBoundingClientRect();
  const buttonCenter =
    buttonRect.left - containerRect.left + buttonRect.width / 2;
  const left = Math.max(
    0,
    container.scrollLeft + buttonCenter - container.clientWidth / 2,
  );
  if (typeof container.scrollTo === "function") {
    container.scrollTo({ left, behavior: scrollBehaviors.smooth });
  } else {
    container.scrollLeft = left;
  }
}
