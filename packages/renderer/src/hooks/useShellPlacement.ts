import { useEffect, useState } from "react";
import {
  getCurrentPlacement,
  subscribePlacement,
  type ShellPlacement,
} from "../themes/layout.js";

/** Subscribe a component to the active shell placement. Re-renders whenever the
 *  user changes the pane arrangement (Settings → Appearance). */
export function useShellPlacement(): ShellPlacement {
  const [placement, setPlacement] = useState<ShellPlacement>(getCurrentPlacement);
  useEffect(() => subscribePlacement(setPlacement), []);
  return placement;
}
