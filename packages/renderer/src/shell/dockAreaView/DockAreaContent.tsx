import type { JSX } from "react";
import { DockPaneContent } from "../DockPaneContent.js";
import type { DockPaneId } from "../dockLayout.js";
import type { DockAreaName } from "./types.js";

export function DockAreaContent({
  active,
  area,
  className,
  empty,
}: {
  active: DockPaneId | undefined;
  area: DockAreaName;
  className: string;
  empty: JSX.Element | null;
}): JSX.Element {
  return (
    <div className={className}>
      {active !== undefined ? (
        <DockPaneContent pane={active} area={area} />
      ) : (
        (empty ?? <div className="dock-empty">Drop a pane here</div>)
      )}
    </div>
  );
}
