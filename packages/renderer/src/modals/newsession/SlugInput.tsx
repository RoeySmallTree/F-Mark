/* SlugInput — `.f-mark/sessions/<YYYY-MM-DD>-<input>/` field.
   Renders the date prefix as a read-only segment alongside the editable
   slug tail, matching planning/redesign/modals.jsx NewSessionModal markup. */

import type { JSX } from "react";

export function todayDatePrefix(now: Date = new Date()): string {
  // YYYY-MM-DD in UTC; matches CLI session-id prefix.
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export interface SlugInputProps {
  value: string;
  onChange(next: string): void;
  /** Inject a fixed date for deterministic tests; defaults to today UTC. */
  datePrefix?: string;
  autoFocus?: boolean;
  inputRef?: React.RefObject<HTMLInputElement>;
}

export function SlugInput(props: SlugInputProps): JSX.Element {
  const date = props.datePrefix ?? todayDatePrefix();
  const prefixText = `.f-mark/sessions/${date}-`;

  return (
    <div className="slug-input">
      <span className="slug-prefix" aria-hidden="true">
        {prefixText}
      </span>
      <input
        ref={props.inputRef}
        className="slug-tail"
        placeholder="my-session"
        value={props.value}
        autoFocus={props.autoFocus}
        aria-label="Session slug"
        onChange={(e) => {
          // Mirror the prototype: lowercase + strip everything except a-z, 0-9, hyphen.
          const raw = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
          props.onChange(raw);
        }}
      />
      <span className="slug-suffix" aria-hidden="true">
        /
      </span>
    </div>
  );
}
