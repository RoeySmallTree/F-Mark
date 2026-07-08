import type { JSX } from "react";
import { asIcon, ICON_CHOICES, type IconName } from "../model.js";

interface RuntimeIconFieldProps {
  value: IconName;
  onChange(value: IconName): void;
}

export function RuntimeIconField({
  value,
  onChange,
}: RuntimeIconFieldProps): JSX.Element {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span className="form-label">Icon</span>
      <select
        className="form-input"
        value={value}
        onChange={(event) => onChange(asIcon(event.target.value))}
        aria-label="Icon"
      >
        {ICON_CHOICES.map((icon) => (
          <option key={icon} value={icon}>
            {icon}
          </option>
        ))}
      </select>
    </label>
  );
}
