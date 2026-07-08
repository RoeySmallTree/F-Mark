import type { RightTabKey } from "../../state/store.js";
import type { DockPaneId } from "../dockLayout.js";

const RIGHT_TAB_KEYS = new Set<RightTabKey>([
  "todos",
  "comments",
  "named",
  "agents",
  "log",
  "files",
  "diffTree",
  "terminal",
]);

export function isRightTabKey(value: DockPaneId): value is RightTabKey {
  return RIGHT_TAB_KEYS.has(value as RightTabKey);
}
