/* NameChip — "Name it" affordance that lives above the compose textarea.
   Two visual states keyed off compose mode:
     - inactive → compact pill ("Name it"); clicking expands.
     - active   → inline title input + × cancel; cancel closes back to the pill
                  (and clears the name).
   Subsumes the prior NameInput card + the ModeBar "Name it" pill. */

import { useEffect, useRef, type JSX } from "react";
import { FileText, X } from "lucide-react";

interface Props {
  active: boolean;
  value: string;
  onChange(v: string): void;
  onActivate(): void;
  onCancel(): void;
}

export function NameChip({
  active,
  value,
  onChange,
  onActivate,
  onCancel,
}: Props): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (active) inputRef.current?.focus();
  }, [active]);

  if (!active) {
    return (
      <button
        type="button"
        className="name-chip"
        onClick={onActivate}
        aria-label="Name this contribution"
        title="Name this contribution"
      >
        <FileText size={13} aria-hidden />
        <span>Name it</span>
      </button>
    );
  }

  return (
    <div
      className="name-chip name-chip-expanded"
      role="group"
      aria-label="Contribution name"
    >
      <FileText size={13} aria-hidden className="name-chip-icon" />
      <input
        ref={inputRef}
        type="text"
        className="name-chip-input"
        placeholder="Name this contribution…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="name-chip-close"
        onClick={onCancel}
        aria-label="Cancel naming"
        title="Cancel"
      >
        <X size={13} aria-hidden />
      </button>
    </div>
  );
}
