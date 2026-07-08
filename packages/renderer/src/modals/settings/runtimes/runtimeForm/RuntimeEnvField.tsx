import type { JSX } from "react";

interface RuntimeEnvFieldProps {
  value: string;
  onChange(value: string): void;
}

export function RuntimeEnvField({
  value,
  onChange,
}: RuntimeEnvFieldProps): JSX.Element {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        gridColumn: "1 / -1",
      }}
    >
      <span className="form-label">Env</span>
      <textarea
        className="form-textarea"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="OPENAI_API_KEY=..."
        aria-label="Env"
        rows={3}
      />
    </label>
  );
}
