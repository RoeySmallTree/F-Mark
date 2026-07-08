import { useEffect, useState } from "react";
import {
  getCurrentDockPaneDrag,
  subscribeDockPaneDrag,
  type DockPaneId,
} from "../shell/dockLayout.js";

export function useDockPaneDrag(): DockPaneId | null {
  const [pane, setPane] = useState<DockPaneId | null>(() =>
    getCurrentDockPaneDrag(),
  );
  useEffect(() => subscribeDockPaneDrag(setPane), []);
  return pane;
}
