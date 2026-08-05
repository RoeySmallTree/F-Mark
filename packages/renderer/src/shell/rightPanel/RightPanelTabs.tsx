import { useRef, type JSX } from "react";
import { SlidersHorizontal } from "lucide-react";
import type { RightTabKey } from "../../state/store.js";
import { DOCK_META, type DockPaneId } from "../dockLayout.js";
import type { RightPanelDockController } from "./useRightPanelDockController.js";
import { isRightTabKey } from "./tabKeys.js";
import { useRovingTabIndex } from "../../a11y/useRovingTabIndex.js";

const NO_LOOSE_STRING_VALUES = {
  layout: "layout",
} as const;

interface Props {
  counts: Partial<Record<RightTabKey, number>>;
  dock: RightPanelDockController;
}

export function RightPanelTabs({ counts, dock }: Props): JSX.Element {
  const tabs: Array<DockPaneId | "layout"> = [
    ...dock.rightPanes,
    NO_LOOSE_STRING_VALUES.layout,
  ];
  const activeIndex = Math.max(
    tabs.findIndex((tab) => tab === dock.activePane),
    0,
  );
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const { tabIndexFor, onKeyDown } = useRovingTabIndex(
    tabs.length,
    activeIndex,
    (index) => {
      const tab = tabs[index];
      if (tab === undefined) return;
      dock.selectTab(tab);
      buttonRefs.current[index]?.focus();
    },
  );

  return (
    <div
      ref={dock.tabsRef}
      className="right-tabs"
      role="tablist"
      aria-label="Right panel tabs"
      onDragOver={dock.onTabsDragOver}
      onDragLeave={dock.onTabsDragLeave}
      onDrop={dock.onTabsDrop}
      onKeyDown={onKeyDown}
    >
      {dock.rightPanes.map((pane, index) => (
        <RightPanelTabButton
          key={pane}
          count={isRightTabKey(pane) ? counts[pane] : undefined}
          dock={dock}
          pane={pane}
          tabIndex={tabIndexFor(index)}
          elRef={(el) => {
            buttonRefs.current[index] = el;
          }}
        />
      ))}
      <button
        type="button"
        role="tab"
        data-tab="layout"
        aria-selected={dock.activePane === "layout"}
        aria-label="Layout settings"
        title="Layout settings"
        tabIndex={tabIndexFor(tabs.length - 1)}
        ref={(el) => {
          buttonRefs.current[tabs.length - 1] = el;
        }}
        className={`icon-only${dock.activePane === "layout" ? " active" : ""}`}
        onClick={() => dock.selectTab(NO_LOOSE_STRING_VALUES.layout)}
      >
        <SlidersHorizontal size={12} aria-hidden="true" />
      </button>
    </div>
  );
}

function RightPanelTabButton({
  count,
  dock,
  pane,
  tabIndex,
  elRef,
}: {
  count: number | undefined;
  dock: RightPanelDockController;
  pane: DockPaneId;
  tabIndex: 0 | -1;
  elRef: (el: HTMLButtonElement | null) => void;
}): JSX.Element {
  const meta = DOCK_META[pane];
  return (
    <button
      ref={elRef}
      type="button"
      role="tab"
      data-pane={pane}
      data-tab={isRightTabKey(pane) ? pane : undefined}
      data-drop-before={
        dock.dropBefore === pane && dock.draggedPane !== pane ? "true" : undefined
      }
      aria-selected={dock.activePane === pane}
      /* The visible label collapses to an icon when the column is narrow, so
         the name has to come from aria-label rather than the text node — the
         accessible name must not depend on the viewport. */
      aria-label={
        count !== undefined ? `${meta.label} (${count})` : meta.label
      }
      title={meta.label}
      tabIndex={tabIndex}
      className={dock.activePane === pane ? "active" : ""}
      draggable
      onDragStart={(event) => dock.onTabDragStart(event, pane)}
      onDragEnd={dock.onTabDragEnd}
      onDragOver={(event) => dock.onTabDragOver(event, pane)}
      onDrop={(event) => dock.onTabDrop(event, pane)}
      onClick={() => dock.selectTab(pane)}
    >
      {meta.icon}
      <span className="right-tab-label">{meta.label}</span>
      {count !== undefined ? <span className="ct">{count}</span> : null}
    </button>
  );
}
