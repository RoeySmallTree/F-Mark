import type { DragEvent, JSX } from "react";
import type { DockArea, DockPaneId } from "../dockLayout.js";

export type DockAreaName = Exclude<DockArea, "toolbar">;

export interface DockAreaViewProps {
  area: DockAreaName;
  label: string;
  tabsClassName?: string;
  contentClassName?: string;
  empty?: JSX.Element | null;
  onActivate?: (pane: DockPaneId) => void;
  alwaysShowTabs?: boolean;
}

export interface DockAreaController {
  active: DockPaneId | undefined;
  draggedPane: DockPaneId | null;
  dropBefore: DockPaneId | null;
  dropOver: boolean;
  panes: DockPaneId[];
  activate(pane: DockPaneId): void;
  onAreaDragEnter(event: DragEvent<HTMLElement>): void;
  onAreaDragLeave(event: DragEvent<HTMLElement>): void;
  onAreaDragOver(event: DragEvent<HTMLElement>): void;
  onAreaDrop(event: DragEvent<HTMLElement>): void;
  onTabDragEnd(): void;
  onTabDragLeave(event: DragEvent<HTMLButtonElement>, pane: DockPaneId): void;
  onTabDragOver(event: DragEvent<HTMLButtonElement>, pane: DockPaneId): void;
  onTabDragStart(event: DragEvent<HTMLButtonElement>, pane: DockPaneId): void;
  onTabDrop(event: DragEvent<HTMLButtonElement>, pane: DockPaneId): void;
}
