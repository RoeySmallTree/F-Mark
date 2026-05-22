/* TemplateGrid — 4-card radio (Blank / Planning / Research / Code review).
   Active card gets .on; emits the selected TemplateKey via onChange. */

import type { JSX } from "react";
import { TEMPLATES, type TemplateKey } from "./templates.js";

export interface TemplateGridProps {
  value: TemplateKey;
  onChange(next: TemplateKey): void;
}

export function TemplateGrid(props: TemplateGridProps): JSX.Element {
  return (
    <div className="template-grid" role="radiogroup" aria-label="Session template">
      {TEMPLATES.map((tpl) => {
        const active = tpl.key === props.value;
        return (
          <button
            key={tpl.key}
            type="button"
            className={`template-card${active ? " on" : ""}`}
            role="radio"
            aria-checked={active}
            data-template={tpl.key}
            onClick={() => props.onChange(tpl.key)}
          >
            <div className="template-icon" aria-hidden="true">
              {tpl.icon}
            </div>
            <div className="template-text">
              <div className="template-name">{tpl.name}</div>
              <div className="template-desc">{tpl.description}</div>
            </div>
            <div className="template-radio" aria-hidden="true">
              {active && <span />}
            </div>
          </button>
        );
      })}
    </div>
  );
}
