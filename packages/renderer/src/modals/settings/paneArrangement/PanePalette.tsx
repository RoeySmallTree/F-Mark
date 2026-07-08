import type { JSX } from "react";
import {
  DOCK_META,
  type DockArea,
  type DockPaneId,
} from "../../../shell/dockLayout.js";

const NO_LOOSE_STRING_VALUES = {
  toolbar: "toolbar",
} as const;

export function PanePalette({
  toolbarPanes,
  dropArea,
  onSetDropArea,
  onDropArea,
  onDropPane,
  onClearDropIfLeaving,
  onStartDrag,
  onEndDrag,
  onReset,
}: {
  toolbarPanes: DockPaneId[];
  dropArea: DockArea | null;
  onSetDropArea(area: DockArea): void;
  onDropArea: ReturnType<typeof import("./usePaneArrangementController.js").usePaneArrangementController>["onDropArea"];
  onDropPane: ReturnType<typeof import("./usePaneArrangementController.js").usePaneArrangementController>["onDropPane"];
  onClearDropIfLeaving(relatedTarget: EventTarget | null, currentTarget: HTMLElement): void;
  onStartDrag: ReturnType<typeof import("./usePaneArrangementController.js").usePaneArrangementController>["startDrag"];
  onEndDrag(): void;
  onReset(): void;
}): JSX.Element {
  return (
    <div
      className="pane-palette"
      data-drop-over={dropArea === "toolbar" ? "true" : undefined}
      onDragOver={(e) => {
        e.preventDefault();
        onSetDropArea(NO_LOOSE_STRING_VALUES.toolbar);
      }}
      onDragLeave={(e) => onClearDropIfLeaving(e.relatedTarget, e.currentTarget)}
      onDrop={(e) => onDropArea(e, NO_LOOSE_STRING_VALUES.toolbar)}
      aria-label="Undocked pane list"
    >
      <div className="pane-palette-head">
        <span>Toolbar</span>
        <button type="button" onClick={onReset}>
          Reset
        </button>
      </div>
      <div className="pane-palette-list">
        {toolbarPanes.map((pane) => (
          <ToolbarPaneButton
            key={pane}
            pane={pane}
            onDropPane={onDropPane}
            onStartDrag={onStartDrag}
            onEndDrag={onEndDrag}
          />
        ))}
        {toolbarPanes.length === 0 ? (
          <div className="pane-palette-empty">All panes are on screen</div>
        ) : null}
      </div>
    </div>
  );
}

function ToolbarPaneButton({
  pane,
  onDropPane,
  onStartDrag,
  onEndDrag,
}: {
  pane: DockPaneId;
  onDropPane: ReturnType<typeof import("./usePaneArrangementController.js").usePaneArrangementController>["onDropPane"];
  onStartDrag: ReturnType<typeof import("./usePaneArrangementController.js").usePaneArrangementController>["startDrag"];
  onEndDrag(): void;
}): JSX.Element {
  const meta = DOCK_META[pane];
  return (
    <button
      type="button"
      className="pane-palette-item"
      title={meta.label}
      aria-label={meta.label}
      draggable
      onDragStart={(e) => onStartDrag(e, pane)}
      onDragEnd={onEndDrag}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => onDropPane(e, NO_LOOSE_STRING_VALUES.toolbar, pane)}
    >
      <span className="pane-palette-icon">{meta.icon}</span>
      <span>{meta.short}</span>
    </button>
  );
}
