import type { JSX } from "react";

interface RuntimeTextFieldProps {
  ariaLabel: string;
  disabled?: boolean;
  inputMode?: "numeric";
  label: string;
  placeholder?: string;
  value: string;
  onChange(value: string): void;
}

export function RuntimeTextField({
  ariaLabel,
  disabled,
  inputMode,
  label,
  placeholder,
  value,
  onChange,
}: RuntimeTextFieldProps): JSX.Element {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span className="form-label">{label}</span>
      <input
        className="form-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        disabled={disabled}
        inputMode={inputMode}
      />
    </label>
  );
}
