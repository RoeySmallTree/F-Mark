import { useRef, type JSX } from "react";
import { useDockLayout } from "../hooks/useDockLayout.js";
import { applyDockLayout, DOCK_META, setDockActive } from "./dockLayout.js";
import { ViewModeToggle } from "./topBar/ViewModeToggle.js";
import { useRovingTabIndex } from "../a11y/useRovingTabIndex.js";

const NO_LOOSE_STRING_VALUES = {
  center: "center",
} as const;

/* The ledger's own header: what you are looking at (left) and how you want it
   filtered (right). Both used to live in the top bar, which put document
   controls two zones away from the document and made one strip of five tabs
   out of two unrelated choices — a pane switcher and a view filter.

   The pane switcher only renders when there is a second pane to switch to;
   a tablist with one tab is not a choice. */
export function LedgerHeader(): JSX.Element {
  const layout = useDockLayout();
  const centerPanes = layout.areas.center;
  const active =
    layout.active.center !== undefined &&
    centerPanes.includes(layout.active.center)
      ? layout.active.center
      : centerPanes[0];
  const paneRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = active !== undefined ? centerPanes.indexOf(active) : 0;
  const { tabIndexFor, onKeyDown } = useRovingTabIndex(
    centerPanes.length,
    activeIndex < 0 ? 0 : activeIndex,
    (index) => {
      const pane = centerPanes[index];
      if (pane === undefined) return;
      applyDockLayout(
        setDockActive(layout, NO_LOOSE_STRING_VALUES.center, pane),
      );
      paneRefs.current[index]?.focus();
    },
  );

  return (
    <div className="ledger-header">
      {centerPanes.length > 1 ? (
        <div
          className="ledger-panes"
          role="tablist"
          aria-label="Center pane"
          onKeyDown={onKeyDown}
        >
          {centerPanes.map((pane, index) => (
            <button
              key={pane}
              ref={(el) => {
                paneRefs.current[index] = el;
              }}
              type="button"
              role="tab"
              aria-selected={pane === active}
              tabIndex={tabIndexFor(index)}
              className={pane === active ? "active" : ""}
              onClick={() =>
                applyDockLayout(
                  setDockActive(layout, NO_LOOSE_STRING_VALUES.center, pane),
                )
              }
            >
              {DOCK_META[pane].icon}
              <span>{DOCK_META[pane].label}</span>
            </button>
          ))}
        </div>
      ) : (
        <span className="ledger-header-spacer" />
      )}
      <ViewModeToggle />
    </div>
  );
}
