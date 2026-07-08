import type { JSX } from "react";
import {
  DOCK_META,
  type DockPaneId,
} from "../../../shell/dockLayout.js";
import {
  AREA_HINT,
  AREA_LABEL,
  type BoardArea,
} from "./model.js";
import type { usePaneArrangementController } from "./usePaneArrangementController.js";

type Controller = ReturnType<typeof usePaneArrangementController>;

export function PaneBoardZone({
  area,
  controller,
}: {
  area: BoardArea;
  controller: Controller;
}): JSX.Element {
  const panes = controller.layout.areas[area];
  return (
    <div
      className={`pane-board-zone pane-board-zone-${area}`}
      data-empty={panes.length === 0 ? "true" : undefined}
      data-drop-over={controller.dropArea === area ? "true" : undefined}
      onDragOver={(e) => {
        e.preventDefault();
        controller.setDropArea(area);
      }}
      onDragLeave={(e) =>
        controller.clearDropIfLeaving(e.relatedTarget, e.currentTarget)
      }
      onDrop={(e) => controller.onDropArea(e, area)}
      aria-label={`${AREA_LABEL[area]} dock area`}
    >
      <span className="pane-zone-label">{AREA_LABEL[area]}</span>
      <span className="pane-area-help">{AREA_HINT[area]}</span>
      {panes.length > 0 ? (
        <div className="pane-tile-list" aria-label={`${AREA_LABEL[area]} panes`}>
          {panes.map((pane) => (
            <PaneTile
              key={pane}
              area={area}
              controller={controller}
              pane={pane}
            />
          ))}
        </div>
      ) : (
        <div className="pane-drop-copy">Drop panes here</div>
      )}
    </div>
  );
}

function PaneTile({
  area,
  controller,
  pane,
}: {
  area: BoardArea;
  controller: Controller;
  pane: DockPaneId;
}): JSX.Element {
  const meta = DOCK_META[pane];
  return (
    <button
      type="button"
      className="pane-tile"
      title={meta.label}
      aria-label={meta.label}
      draggable
      onClick={() => controller.activatePane(area, pane)}
      onDragStart={(e) => controller.startDrag(e, pane)}
      onDragEnd={controller.endDrag}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => controller.onDropPane(e, area, pane)}
    >
      <span className="pane-tile-icon">{meta.icon}</span>
      <span className="pane-tile-label">{meta.short}</span>
    </button>
  );
}
