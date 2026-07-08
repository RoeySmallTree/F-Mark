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
import { ThemePicker } from "../../components/ThemePicker.js";
import { PaneArrangementEditor } from "./PaneArrangementEditor.js";

export function Appearance(): JSX.Element {
  const [density, setDensity] = useState<DensityName>(() =>
    getCurrentDensity(),
  );

  useEffect(() => {
    const unsubDensity = subscribeDensity((n) => setDensity(n));
    return () => unsubDensity();
  }, []);

  function pickDensity(name: DensityName): void {
    applyDensity(name);
    setDensity(name);
  }

  return (
    <>
      <h3 className="settings-h">Appearance</h3>
      <div className="settings-sub">
        Theme, density, and pane arrangement apply instantly and persist across
        reloads.
      </div>

      <section className="settings-stack-row">
        <div className="settings-l">Theme</div>
        <ThemePicker />
      </section>

      <section className="settings-stack-row">
        <div className="settings-l">Density</div>
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
        <div className="settings-help">
          {DENSITIES.find((d) => d.name === density)?.description}
        </div>
      </section>

      <section className="settings-stack-row pane-arrangement-host">
        <div className="settings-l">Pane arrangement</div>
        <PaneArrangementEditor />
      </section>
    </>
  );
}
