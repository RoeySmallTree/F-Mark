/* Appearance section — Settings → Appearance.
   Theme (shared <ThemePicker>: list + live preview), density, and pane
   arrangement. All three apply instantly and persist to localStorage via the
   theme / density / layout modules so reloading keeps the choice. */

import { useEffect, useState, type JSX } from "react";
import {
  applyDensity,
  DENSITIES,
  getCurrentDensity,
  subscribeDensity,
  type DensityName,
} from "../../themes/density.js";
import {
  applyPlacement,
  enumeratePlacements,
  getCurrentPlacement,
  placementKey,
  placementPreviewGrid,
  SHELL_LAYOUT_KINDS,
  subscribePlacement,
  type PaneId,
  type ShellPlacement,
} from "../../themes/layout.js";
import { ThemePicker } from "../../components/ThemePicker.js";

const PANE_LABEL: Record<PaneId, string> = {
  leftPanel: "L",
  chat: "C",
  rightPanel: "R",
};

export function Appearance(): JSX.Element {
  const [density, setDensity] = useState<DensityName>(() =>
    getCurrentDensity(),
  );
  const [placement, setPlacement] = useState<ShellPlacement>(() =>
    getCurrentPlacement(),
  );
  const [pickerKind, setPickerKind] = useState<ShellPlacement["kind"]>(
    () => getCurrentPlacement().kind,
  );

  useEffect(() => {
    const unsubDensity = subscribeDensity((n) => setDensity(n));
    const unsubPlacement = subscribePlacement((p) => setPlacement(p));
    return () => {
      unsubDensity();
      unsubPlacement();
    };
  }, []);

  function pickDensity(name: DensityName): void {
    applyDensity(name);
    setDensity(name);
  }

  function pickPlacement(p: ShellPlacement): void {
    applyPlacement(p);
    setPlacement(p);
  }

  const activeKey = placementKey(placement);

  return (
    <>
      <h3 className="settings-h">Appearance</h3>
      <div className="settings-sub">
        Theme, density, and pane arrangement apply instantly and persist across
        reloads.
      </div>

      <div className="settings-row" style={{ alignItems: "flex-start" }}>
        <div className="settings-l" style={{ paddingTop: 6 }}>
          Theme
        </div>
        <div className="settings-r">
          <ThemePicker />
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

      <div className="settings-row" style={{ alignItems: "flex-start" }}>
        <div className="settings-l" style={{ paddingTop: 6 }}>
          Pane arrangement
        </div>
        <div className="settings-r">
          <div
            className="seg-control"
            role="radiogroup"
            aria-label="Layout pattern"
          >
            {SHELL_LAYOUT_KINDS.map((k) => (
              <button
                key={k.kind}
                type="button"
                role="radio"
                aria-checked={k.kind === pickerKind}
                className={k.kind === pickerKind ? "on" : ""}
                onClick={() => setPickerKind(k.kind)}
                title={k.description}
              >
                {k.label}
              </button>
            ))}
          </div>
          <div
            className="layout-grid"
            role="radiogroup"
            aria-label="Pane placement"
          >
            {enumeratePlacements(pickerKind).map((p) => {
              const key = placementKey(p);
              const preview = placementPreviewGrid(p);
              const active = key === activeKey;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={key}
                  className={`layout-card${active ? " active" : ""}`}
                  onClick={() => pickPlacement(p)}
                >
                  <span
                    className="layout-card-grid"
                    style={{
                      gridTemplateColumns: preview.columns,
                      gridTemplateRows: preview.rows,
                      gridTemplateAreas: preview.areas,
                    }}
                  >
                    <span
                      className="layout-card-rail"
                      style={{ gridArea: "rail" }}
                      aria-hidden
                    />
                    {(["leftPanel", "chat", "rightPanel"] as PaneId[]).map(
                      (pane) => (
                        <span
                          key={pane}
                          className={`layout-card-pane${pane === "chat" ? " is-chat" : ""}`}
                          style={{ gridArea: pane }}
                        >
                          {PANE_LABEL[pane]}
                        </span>
                      ),
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: "var(--ink-4)",
              marginTop: 6,
              fontFamily: "var(--sans)",
            }}
          >
            L = left pane · C = chat · R = right pane. The icon rail stays pinned
            to the left edge.
          </div>
        </div>
      </div>
    </>
  );
}
