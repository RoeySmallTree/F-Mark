import { useEffect, useState } from "react";
import {
  getCurrentDockLayout,
  subscribeDockLayout,
  type DockLayout,
} from "../shell/dockLayout.js";

export function useDockLayout(): DockLayout {
  const [layout, setLayout] = useState<DockLayout>(() => getCurrentDockLayout());
  useEffect(() => subscribeDockLayout(setLayout), []);
  return layout;
}
