import type { JSX } from "react";
import { DOCK_META } from "../dockLayout.js";
import type { DockAreaController } from "./types.js";

export function DockAreaTabs({
  className,
  dock,
  label,
}: {
  className: string;
  dock: DockAreaController;
  label: string;
}): JSX.Element {
  return (
    /* data-pane-count lets CSS suppress a strip that offers no choice (a lone
       tab) without hiding it unconditionally — an area that gains a second
       pane must get its switcher back rather than be stranded. */
    <div
      className={className}
      role="tablist"
      aria-label={label}
      data-pane-count={dock.panes.length}
    >
      {dock.panes.map((pane) => {
        const meta = DOCK_META[pane];
        return (
          <button
            key={pane}
            type="button"
            role="tab"
            data-pane={pane}
            data-drop-before={
              dock.dropBefore === pane && dock.draggedPane !== pane
                ? "true"
                : undefined
            }
            aria-selected={pane === dock.active}
            className={pane === dock.active ? "active" : ""}
            draggable
            onClick={() => dock.activate(pane)}
            onDragStart={(event) => dock.onTabDragStart(event, pane)}
            onDragEnd={dock.onTabDragEnd}
            onDragOver={(event) => dock.onTabDragOver(event, pane)}
            onDragLeave={(event) => dock.onTabDragLeave(event, pane)}
            onDrop={(event) => dock.onTabDrop(event, pane)}
          >
            {meta.icon}
            <span>{meta.short}</span>
          </button>
        );
      })}
    </div>
  );
}
