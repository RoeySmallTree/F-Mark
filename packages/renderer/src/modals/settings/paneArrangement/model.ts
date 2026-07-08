import type {
  DockArea,
  DockPaneId,
} from "../../../shell/dockLayout.js";
import type {
  LeftRailKey,
  RightTabKey,
} from "../../../state/store.js";

export type BoardArea = Exclude<DockArea, "toolbar">;

export const BOARD_AREAS: BoardArea[] = ["left", "center", "right", "bottom"];

export const AREA_LABEL: Record<BoardArea, string> = {
  left: "Left",
  center: "Main",
  right: "Right",
  bottom: "Lower",
};

export const AREA_HINT: Record<BoardArea, string> = {
  left: "Tabs in the left pane",
  center: "Tabs beside the feed filter",
  right: "Tabs in the right pane",
  bottom: "Tabs in the lower pane",
};

const LEFT_RAIL_KEYS = new Set<DockPaneId>([
  "sessions",
  "named",
  "todos",
  "comments",
  "search",
]);

const RIGHT_TAB_KEYS = new Set<DockPaneId>([
  "todos",
  "comments",
  "named",
  "agents",
  "log",
  "files",
  "terminal",
]);

export function isLeftRailKey(pane: DockPaneId): pane is LeftRailKey {
  return LEFT_RAIL_KEYS.has(pane);
}

export function isRightTabKey(pane: DockPaneId): pane is RightTabKey {
  return RIGHT_TAB_KEYS.has(pane);
}
