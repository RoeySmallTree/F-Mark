import type { JSX } from "react";
import "./tabEmpty.css";

const PANEL_LOADING_VALUES = {
  loading: "Loading…",
} as const;

interface PanelLoadingStateProps {
  /** Stretch to fill the pane area, same as TabEmptyState's fill prop. */
  fill?: boolean;
  label?: string;
}

/* Spinner SVG — a faint full-circle track with a bright arc that rotates
   via CSS. Both arcs share the same origin so the animation fires on the
   `<path>` only, keeping the circle static (no GPU reflow). */
function SpinnerSvg(): JSX.Element {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      strokeLinecap="round"
    >
      {/* track */}
      <circle
        cx="20"
        cy="20"
        r="14"
        stroke="currentColor"
        strokeWidth="2"
        strokeOpacity="0.15"
      />
      {/* spinning arc — quarter-circle */}
      <path
        d="M20 6 A14 14 0 0 1 34 20"
        stroke="currentColor"
        strokeWidth="2"
        className="tab-icon-spinner"
      />
    </svg>
  );
}

export function PanelLoadingState({
  fill = true,
  label = PANEL_LOADING_VALUES.loading,
}: PanelLoadingStateProps): JSX.Element {
  return (
    <div
      className={[
        "tab-empty",
        "panel-loading-state",
        fill ? "tab-empty-fill" : "",
      ].filter(Boolean).join(" ")}
      aria-live="polite"
      aria-label={label}
    >
      <div className="tab-empty-icon-outer" aria-hidden="true">
        <div className="tab-empty-icon-inner">
          <SpinnerSvg />
        </div>
      </div>
      <p className="tab-empty-title">{label}</p>
    </div>
  );
}
