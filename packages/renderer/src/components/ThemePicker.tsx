/* ThemePicker — the shared theme interface: a scrollable list of themes on the
   left, a live sample-feed preview on the right. Hovering a theme previews it
   across the whole app (applyTheme swaps the body class); leaving the list
   reverts to the committed selection; clicking commits + persists.

   Used by the onboarding wizard (ThemeStep) and Settings → Appearance so both
   surfaces share one interface and one source of truth. */

import { useEffect, useRef, useState, type JSX } from "react";
import {
  applyTheme,
  getCurrentTheme,
  subscribeTheme,
  THEMES,
  type ThemeName,
} from "../themes/index.js";
import { ThemePreview } from "./ThemePreview.js";

export function ThemePicker(): JSX.Element {
  const [committed, setCommitted] = useState<ThemeName>(() =>
    getCurrentTheme(),
  );
  const committedRef = useRef(committed);
  committedRef.current = committed;

  // Sync if another surface changes the theme; on unmount snap back to the
  // committed choice so a dangling hover-preview never persists.
  useEffect(() => {
    const unsub = subscribeTheme((n) => setCommitted(n));
    return () => {
      unsub();
      applyTheme(committedRef.current);
    };
  }, []);

  function preview(name: ThemeName): void {
    applyTheme(name); // visual only; committed unchanged until click
  }
  function revert(): void {
    applyTheme(committedRef.current);
  }
  function commit(name: ThemeName): void {
    setCommitted(name);
    applyTheme(name);
  }

  return (
    <div className="theme-picker">
      <div
        className="theme-picker-list"
        role="radiogroup"
        aria-label="Color theme"
        onMouseLeave={revert}
      >
        {THEMES.map((t) => {
          const active = t.name === committed;
          return (
            <button
              key={t.name}
              type="button"
              role="radio"
              aria-checked={active}
              className={`theme-picker-item${active ? " active" : ""}`}
              onMouseEnter={() => preview(t.name)}
              onFocus={() => preview(t.name)}
              onBlur={revert}
              onClick={() => commit(t.name)}
            >
              <span className="theme-picker-name">{t.label}</span>
              <span className="theme-picker-desc">{t.description}</span>
            </button>
          );
        })}
      </div>
      <div className="theme-picker-preview">
        <ThemePreview />
      </div>
    </div>
  );
}
