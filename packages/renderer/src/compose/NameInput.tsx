/* NameInput — serif title input shown when compose mode = 'named'.
   Mirrors design.html's `.compose-name` block. */

import { type JSX } from "react";

interface Props {
  value: string;
  onChange(v: string): void;
}

export function NameInput({ value, onChange }: Props): JSX.Element {
  return (
    <div className="compose-name">
      <label htmlFor="compose-name-input">NAME</label>
      <input
        id="compose-name-input"
        type="text"
        className="serif title-input"
        placeholder="Name this contribution…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
