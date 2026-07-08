import type { JSX } from "react";
import { DockAreaContent } from "./dockAreaView/DockAreaContent.js";
import { DockAreaDragHint } from "./dockAreaView/DockAreaDragHint.js";
import { DockAreaDropOverlay } from "./dockAreaView/DockAreaDropOverlay.js";
import { DockAreaTabs } from "./dockAreaView/DockAreaTabs.js";
import type { DockAreaViewProps } from "./dockAreaView/types.js";
import { useDockAreaController } from "./dockAreaView/useDockAreaController.js";

const NO_LOOSE_STRING_VALUES = {
  dockTabs: "dock-tabs",
  dockContent: "dock-content",
} as const;

export function DockAreaView({
  area,
  label,
  tabsClassName = NO_LOOSE_STRING_VALUES.dockTabs,
  contentClassName = NO_LOOSE_STRING_VALUES.dockContent,
  empty = null,
  onActivate,
  alwaysShowTabs = false,
}: DockAreaViewProps): JSX.Element {
  const dock = useDockAreaController({ area, onActivate });

  return (
    <div
      className={`dock-area${dock.dropOver ? " is-drop-over" : ""}`}
      data-dock-area={area}
      onDragEnter={dock.onAreaDragEnter}
      onDragOver={dock.onAreaDragOver}
      onDragLeave={dock.onAreaDragLeave}
      onDrop={dock.onAreaDrop}
    >
      {dock.panes.length > 1 ||
      (alwaysShowTabs && dock.panes.length > 0) ? (
        <DockAreaTabs className={tabsClassName} dock={dock} label={label} />
      ) : null}
      <DockAreaDropOverlay label={label} />
      <DockAreaContent
        active={dock.active}
        area={area}
        className={contentClassName}
        empty={empty}
      />
      <DockAreaDragHint />
    </div>
  );
}
