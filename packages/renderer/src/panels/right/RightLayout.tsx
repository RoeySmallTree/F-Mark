import type { JSX } from "react";
import { PaneArrangementEditor } from "../../modals/settings/PaneArrangementEditor.js";

export function RightLayout(): JSX.Element {
  return (
    <div className="right-layout right-layout-pane-arrangement">
      <PaneArrangementEditor />
    </div>
  );
}
