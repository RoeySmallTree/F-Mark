const NO_LOOSE_STRING_VALUES = {
  panel2: "panel-2",
  ink3: "ink-3",
} as const;

/* ThemePicker — the shared theme interface: a scrollable list of themes on the
   left, a live sample-feed preview on the right. Clicking commits + persists.

   Used by the onboarding wizard (ThemeStep) and Settings → Appearance so both
   surfaces share one interface and one source of truth. */

import { useEffect, useRef, useState, type CSSProperties, type JSX } from "react";
import { resolveThemeTokens } from "@f-mark/shared";
import { useRovingTabIndex } from "../a11y/useRovingTabIndex.js";
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

  // Sync if another surface changes the theme.
  useEffect(() => {
    const unsub = subscribeTheme((n) => setCommitted(n));
    return () => unsub();
  }, []);

  function commit(name: ThemeName): void {
    setCommitted(name);
    applyTheme(name);
  }

  const selectedTheme = THEMES.find((t) => t.name === committed) ?? THEMES[0]!;

  const themeRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const themeIndex = THEMES.findIndex((t) => t.name === committed);
  const roving = useRovingTabIndex(
    THEMES.length,
    themeIndex < 0 ? 0 : themeIndex,
    (index) => {
      const next = THEMES[index];
      if (next === undefined) return;
      commit(next.name);
      themeRefs.current[index]?.focus();
    },
  );

  return (
    <div className="theme-picker">
      <div
        className="theme-picker-list"
        role="radiogroup"
        aria-label="Color theme"
        onKeyDown={roving.onKeyDown}
      >
        {THEMES.map((t, index) => {
          const active = t.name === committed;
          const tokens = resolveThemeTokens(t.name);
          const style = {
            "--theme-row-bg": tokens.canvas,
            "--theme-row-panel": tokens.panel,
            "--theme-row-panel-2": tokens[NO_LOOSE_STRING_VALUES.panel2],
            "--theme-row-ink": tokens.ink,
            "--theme-row-muted": tokens[NO_LOOSE_STRING_VALUES.ink3],
            "--theme-row-line": tokens.line,
            "--theme-row-agent": tokens.agent,
            "--theme-row-user": tokens.user,
            "--theme-row-green": tokens.green,
            "--theme-row-rose": tokens.rose,
          } as CSSProperties;
          return (
            <button
              key={t.name}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${t.label}${active ? " selected" : ""}`}
              className={`theme-picker-item${active ? " active" : ""}`}
              tabIndex={roving.tabIndexFor(index)}
              ref={(el) => {
                themeRefs.current[index] = el;
              }}
              onClick={() => commit(t.name)}
              style={style}
            >
              <span className="theme-picker-top">
                <span className="theme-picker-name">{t.label}</span>
                {active ? (
                  <span className="theme-picker-selected">Selected</span>
                ) : null}
              </span>
              <span className="theme-picker-desc">{t.description}</span>
              <span className="theme-picker-swatches" aria-hidden="true">
                <span style={{ background: tokens.agent }} />
                <span style={{ background: tokens.user }} />
                <span style={{ background: tokens.green }} />
                <span style={{ background: tokens.rose }} />
              </span>
            </button>
          );
        })}
      </div>
      <div className="theme-picker-preview">
        <ThemePreview themeLabel={selectedTheme.label} />
      </div>
    </div>
  );
}
