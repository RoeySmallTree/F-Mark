import type { JSX } from "react";
import { PanePalette } from "./paneArrangement/PanePalette.js";
import { PaneScreen } from "./paneArrangement/PaneScreen.js";
import { usePaneArrangementController } from "./paneArrangement/usePaneArrangementController.js";

export function PaneArrangementEditor(): JSX.Element {
  const controller = usePaneArrangementController();
  return (
    <div className="pane-editor">
      <PanePalette
        toolbarPanes={controller.layout.areas.toolbar}
        dropArea={controller.dropArea}
        onSetDropArea={controller.setDropArea}
        onDropArea={controller.onDropArea}
        onDropPane={controller.onDropPane}
        onClearDropIfLeaving={controller.clearDropIfLeaving}
        onStartDrag={controller.startDrag}
        onEndDrag={controller.endDrag}
        onReset={controller.reset}
      />
      <PaneScreen controller={controller} />
    </div>
  );
}
