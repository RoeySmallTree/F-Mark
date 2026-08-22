/* Appearance section — Settings → Appearance.
   Theme (shared <ThemePicker>: list + live preview), font set, density, and
   pane arrangement. All four apply instantly and persist to localStorage via
   the theme / font / density / layout modules so reloading keeps the choice. */

import { useEffect, useRef, useState, type JSX } from "react";
import { useRovingTabIndex } from "../../a11y/useRovingTabIndex.js";
import {
  applyDensity,
  DENSITIES,
  getCurrentDensity,
  subscribeDensity,
  type DensityName,
} from "../../themes/density.js";
import { FontPicker } from "../../components/FontPicker.js";
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

  const densityRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const densityIndex = DENSITIES.findIndex((d) => d.name === density);
  const densityRoving = useRovingTabIndex(
    DENSITIES.length,
    densityIndex < 0 ? 0 : densityIndex,
    (index) => {
      const next = DENSITIES[index];
      if (next === undefined) return;
      pickDensity(next.name);
      densityRefs.current[index]?.focus();
    },
  );

  return (
    <>
      <h3 className="settings-h">Appearance</h3>
      <div className="settings-sub">
        Theme, font set, density, and pane arrangement apply instantly and
        persist across reloads.
      </div>

      <section className="settings-stack-row">
        <div className="settings-l">Theme</div>
        <ThemePicker />
        <FontPicker />
      </section>

      <section className="settings-stack-row">
        <div className="settings-l">Density</div>
        <div
          className="seg-control"
          role="radiogroup"
          aria-label="Feed density"
          onKeyDown={densityRoving.onKeyDown}
        >
          {DENSITIES.map((d, index) => (
            <button
              key={d.name}
              type="button"
              role="radio"
              aria-checked={d.name === density}
              className={d.name === density ? "on" : ""}
              tabIndex={densityRoving.tabIndexFor(index)}
              ref={(el) => {
                densityRefs.current[index] = el;
              }}
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
