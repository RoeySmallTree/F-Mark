/* RightLog — the Activity-log tab. Lists every event in the current session
   in chronological order (oldest first / newest last). The controller keeps
   filter/popover state at the store seam so tab switches do not reset it. */

import type { JSX } from "react";
import { RightLogView } from "./log/RightLogView.js";
import { useRightLogController } from "./log/useRightLogController.js";

export function RightLog(): JSX.Element {
  const controller = useRightLogController();
  return <RightLogView controller={controller} />;
}
