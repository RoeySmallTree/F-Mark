/* ThemeStep — onboarding wrapper around the shared <ThemePicker> (theme list +
   live preview), font selector, plus a density control. The picker owns theme
   commit / persistence; this step adds font and density choices. */

import { useEffect, useState, type JSX } from "react";
import {
  applyDensity,
  DENSITIES,
  getCurrentDensity,
  subscribeDensity,
  type DensityName,
} from "../../themes/density.js";
import { FontPicker } from "../../components/FontPicker.js";
import { ThemePicker } from "../../components/ThemePicker.js";

export function ThemeStep(): JSX.Element {
  const [density, setDensity] = useState<DensityName>(() =>
    getCurrentDensity(),
  );

  useEffect(() => subscribeDensity((n) => setDensity(n)), []);

  return (
    <div className="ob-theme-step">
      <ThemePicker />
      <FontPicker />
      <div className="ob-density">
        <span className="ob-density-label">Density</span>
        <div className="seg-control" role="radiogroup" aria-label="Density">
          {DENSITIES.map((d) => (
            <button
              key={d.name}
              type="button"
              role="radio"
              aria-checked={d.name === density}
              className={d.name === density ? "on" : ""}
              onClick={() => {
                applyDensity(d.name);
                setDensity(d.name);
              }}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
