import type { JSX } from "react";
import { PaneBoardZone } from "./PaneBoardZone.js";
import { BOARD_AREAS } from "./model.js";
import type { usePaneArrangementController } from "./usePaneArrangementController.js";

type Controller = ReturnType<typeof usePaneArrangementController>;

export function PaneScreen({
  controller,
}: {
  controller: Controller;
}): JSX.Element {
  return (
    <div className="pane-screen" aria-label="Current app layout">
      {BOARD_AREAS.map((area) => (
        <PaneBoardZone key={area} area={area} controller={controller} />
      ))}
    </div>
  );
}
