import { useRef, useState } from "react";
import {
  useStore,
  type LeftRailKey,
  type RightTabKey,
} from "../state/store.js";
import { useDockLayout } from "../hooks/useDockLayout.js";
import { useRovingTabIndex } from "../a11y/useRovingTabIndex.js";
import {
  applyDockLayout,
  clearDockPaneDrag,
  DOCK_META,
  DOCK_PANES,
  moveDockPane,
  setDockActive,
  writeDockPaneData,
  type DockArea,
  type DockPaneId,
} from "./dockLayout.js";

const NO_LOOSE_STRING_VALUES = {
  toolbar: "toolbar",
  left: "left",
  right: "right",
} as const;

const LEFT_RAIL_KEYS = new Set<DockPaneId>([
  "sessions",
  "named",
  "todos",
  "comments",
  "search",
]);

const RIGHT_TAB_KEYS = new Set<DockPaneId>([
  "todos",
  "comments",
  "named",
  "agents",
  "log",
  "files",
  "terminal",
]);

function isLeftRailKey(pane: DockPaneId): pane is LeftRailKey {
  return LEFT_RAIL_KEYS.has(pane);
}

function isRightTabKey(pane: DockPaneId): pane is RightTabKey {
  return RIGHT_TAB_KEYS.has(pane);
}

function areaForPane(
  layout: ReturnType<typeof useDockLayout>,
  pane: DockPaneId,
): DockArea {
  for (const area of [
    "left",
    "center",
    "right",
    "bottom",
    "toolbar",
  ] as const) {
    if (layout.areas[area].includes(pane)) return area;
  }
  return NO_LOOSE_STRING_VALUES.toolbar;
}

export function LeftRail(): JSX.Element {
  const layout = useDockLayout();
  const setLeftRail = useStore((s) => s.setLeftRail);
  const setRightTab = useStore((s) => s.setRightTab);
  /* Focus-only roving: activating an entry can move it between dock areas,
     so arrow keys must not fire that side effect on every press the way
     ViewModeToggle's automatic activation does. Arrows move the tab stop;
     Enter/Space/click (native button behavior) still activates. */
  const [focusIndex, setFocusIndex] = useState(0);
  const railRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const { tabIndexFor, onKeyDown } = useRovingTabIndex(
    DOCK_PANES.length,
    focusIndex,
    (index) => {
      setFocusIndex(index);
      railRefs.current[index]?.focus();
    },
  );

  function activatePane(pane: DockPaneId): void {
    const area = areaForPane(layout, pane);
    if (area === NO_LOOSE_STRING_VALUES.toolbar) {
      applyDockLayout(moveDockPane(layout, pane, NO_LOOSE_STRING_VALUES.left));
      if (isLeftRailKey(pane)) setLeftRail(pane);
      return;
    }
    applyDockLayout(setDockActive(layout, area, pane));
    if (area === NO_LOOSE_STRING_VALUES.left && isLeftRailKey(pane))
      setLeftRail(pane);
    if (area === NO_LOOSE_STRING_VALUES.right && isRightTabKey(pane))
      setRightTab(pane);
  }

  return (
    <nav
      className="left-rail"
      role="tablist"
      aria-label="Placeable panes"
      onKeyDown={onKeyDown}
    >
      {DOCK_PANES.map((pane, index) => {
        const meta = DOCK_META[pane];
        const area = areaForPane(layout, pane);
        const active =
          area !== NO_LOOSE_STRING_VALUES.toolbar &&
          layout.active[area as Exclude<DockArea, "toolbar">] === pane;
        return (
          <button
            key={pane}
            ref={(el) => {
              railRefs.current[index] = el;
            }}
            type="button"
            role="tab"
            data-pane={pane}
            data-dock-area={area}
            aria-selected={active}
            tabIndex={tabIndexFor(index)}
            className={["rail-btn", active ? "active" : ""].join(" ").trim()}
            title={meta.label}
            aria-label={meta.label}
            draggable
            onClick={() => activatePane(pane)}
            onDragStart={(e) =>
              writeDockPaneData(e.dataTransfer, pane, e.currentTarget)
            }
            onDragEnd={clearDockPaneDrag}
          >
            {meta.icon}
          </button>
        );
      })}
    </nav>
  );
}
