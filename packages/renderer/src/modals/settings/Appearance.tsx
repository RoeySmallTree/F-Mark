/* Appearance section — Settings → Appearance.
   Theme picker (6 cards, live preview swatches) + density slider (3-position
   segmented control). Both persist to localStorage via the theme/density
   modules so reloading the page keeps the choice. */

import { useEffect, useState, type JSX } from "react";
import {
  applyTheme,
  getCurrentTheme,
  subscribeTheme,
  THEMES,
  type ThemeName,
} from "../../themes/index.js";
import {
  applyDensity,
  DENSITIES,
  getCurrentDensity,
  subscribeDensity,
  type DensityName,
} from "../../themes/density.js";

/**
 * The preview swatches need the theme's tokens without applying that theme
 * globally — so we hardcode a 4-color sample (canvas / ink / user / agent)
 * for each. Values are lifted verbatim from `planning/redesign/design.html`.
 */
const PREVIEWS: Record<
  ThemeName,
  { canvas: string; ink: string; user: string; agent: string }
> = {
  light: {
    canvas: "#faf6ed",
    ink: "#1a1714",
    user: "#2a5fa8",
    agent: "#b86a1f",
  },
  terminal: {
    canvas: "#0a0c0a",
    ink: "#cfe8c5",
    user: "#4ec0ff",
    agent: "#ffb13e",
  },
  ide: {
    canvas: "#14171c",
    ink: "#e6e8eb",
    user: "#5b9dff",
    agent: "#ffa657",
  },
  solarized: {
    canvas: "#073642",
    ink: "#fdf6e3",
    user: "#268bd2",
    agent: "#cb4b16",
  },
  brutalist: {
    canvas: "#0a0a0a",
    ink: "#ffffff",
    user: "#ffffff",
    agent: "#ffffff",
  },
  cyber: {
    canvas: "#1a0b29",
    ink: "#f5e9ff",
    user: "#00e5ff",
    agent: "#ff2bd6",
  },
};

export function Appearance(): JSX.Element {
  const [theme, setTheme] = useState<ThemeName>(() => getCurrentTheme());
  const [density, setDensity] = useState<DensityName>(() =>
    getCurrentDensity(),
  );

  useEffect(() => {
    const unsubTheme = subscribeTheme((n) => setTheme(n));
    const unsubDensity = subscribeDensity((n) => setDensity(n));
    return () => {
      unsubTheme();
      unsubDensity();
    };
  }, []);

  function pickTheme(name: ThemeName): void {
    applyTheme(name);
    setTheme(name);
  }

  function pickDensity(name: DensityName): void {
    applyDensity(name);
    setDensity(name);
  }

  return (
    <>
      <h3 className="settings-h">Appearance</h3>
      <div className="settings-sub">
        Theme and density apply instantly and persist across reloads.
      </div>

      <div className="settings-row" style={{ alignItems: "flex-start" }}>
        <div className="settings-l" style={{ paddingTop: 6 }}>
          Theme
        </div>
        <div className="settings-r">
          <div
            className="theme-grid"
            role="radiogroup"
            aria-label="Color theme"
          >
            {THEMES.map((t) => {
              const active = t.name === theme;
              const preview = PREVIEWS[t.name];
              return (
                <button
                  key={t.name}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={`theme-card${active ? " active" : ""}`}
                  onClick={() => pickTheme(t.name)}
                  data-theme={t.name}
                >
                  <div className="theme-card-preview" aria-hidden="true">
                    <span style={{ background: preview.canvas }} />
                    <span style={{ background: preview.ink }} />
                    <span style={{ background: preview.user }} />
                    <span style={{ background: preview.agent }} />
                  </div>
                  <div className="theme-card-label">{t.label}</div>
                  <div className="theme-card-desc">{t.description}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-l">Density</div>
        <div className="settings-r">
          <div
            className="seg-control"
            role="radiogroup"
            aria-label="Feed density"
          >
            {DENSITIES.map((d) => (
              <button
                key={d.name}
                type="button"
                role="radio"
                aria-checked={d.name === density}
                className={d.name === density ? "on" : ""}
                onClick={() => pickDensity(d.name)}
              >
                {d.label}
              </button>
            ))}
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: "var(--ink-4)",
              marginTop: 6,
              fontFamily: "var(--sans)",
            }}
          >
            {DENSITIES.find((d) => d.name === density)?.description}
          </div>
        </div>
      </div>
    </>
  );
}
