import { Code2, Rows3 } from "lucide-react";
import type { JsonViewMode } from "../useJsonViewMode.js";

const NO_LOOSE_STRING_VALUES = {
  source: "source",
  tree: "tree",
} as const;

const MODES: {
  key: JsonViewMode;
  label: string;
  icon: typeof Code2;
}[] = [
  {
    key: NO_LOOSE_STRING_VALUES.source,
    label: "Source",
    icon: Code2,
  },
  {
    key: NO_LOOSE_STRING_VALUES.tree,
    label: "Interactive JSON",
    icon: Rows3,
  },
];

export interface JsonViewModeToggleProps {
  mode: JsonViewMode;
  onModeChange(mode: JsonViewMode): void;
}

export function JsonViewModeToggle({
  mode,
  onModeChange,
}: JsonViewModeToggleProps): JSX.Element {
  return (
    <div
      className="fv-diff-style-toggle fv-json-view-toggle"
      role="group"
      aria-label="JSON view mode"
      data-testid="json-view-toggle"
    >
      {MODES.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          className={`fv-diff-style-ibtn ${mode === key ? "is-current" : ""}`}
          onClick={() => onModeChange(key)}
          title={label}
          aria-label={label}
          aria-pressed={mode === key}
          data-testid={`json-view-${key}`}
        >
          <Icon size={13} aria-hidden />
        </button>
      ))}
    </div>
  );
}
