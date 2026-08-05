import { isRightTabKey as isRightTabKeyValue } from "../../state/rightTabsConfig.js";
import type { RightTabKey } from "../../state/store.js";
import type { DockPaneId } from "../dockLayout.js";

/* Narrowing wrapper over the single list in state/rightTabsConfig.ts. This
   file used to keep its own copy of the key set, which then had to be edited
   in lockstep with the canonical one — adding "search" to the rail updated the
   canonical list and silently left this copy behind, so the new tab rendered
   without its data-tab and never persisted. One list, one place. */
export function isRightTabKey(value: DockPaneId): value is RightTabKey {
  return isRightTabKeyValue(value);
}
