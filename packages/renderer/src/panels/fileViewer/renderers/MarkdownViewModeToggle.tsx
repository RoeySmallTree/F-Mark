import { Columns2, Code2, Eye, Rows3 } from "lucide-react";
import type { MarkdownViewMode } from "../useMarkdownViewMode.js";

const NO_LOOSE_STRING_VALUES = {
  preview: "preview",
  interactive: "interactive",
  source: "source",
  sideBySide: "side-by-side",
} as const;

const MODES: {
  key: MarkdownViewMode;
  label: string;
  icon: typeof Eye;
}[] = [
  {
    key: NO_LOOSE_STRING_VALUES.preview,
    label: "Preview",
    icon: Eye,
  },
  {
    key: NO_LOOSE_STRING_VALUES.interactive,
    label: "Interactive outline",
    icon: Rows3,
  },
  {
    key: NO_LOOSE_STRING_VALUES.source,
    label: "Source",
    icon: Code2,
  },
  {
    key: NO_LOOSE_STRING_VALUES.sideBySide,
    label: "Side by side",
    icon: Columns2,
  },
];

export interface MarkdownViewModeToggleProps {
  mode: MarkdownViewMode;
  onModeChange(mode: MarkdownViewMode): void;
}

export function MarkdownViewModeToggle({
  mode,
  onModeChange,
}: MarkdownViewModeToggleProps): JSX.Element {
  return (
    <div
      className="fv-diff-style-toggle fv-markdown-view-toggle"
      role="group"
      aria-label="Markdown view mode"
      data-testid="markdown-view-toggle"
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
          data-testid={`markdown-view-${key}`}
        >
          <Icon size={13} aria-hidden />
        </button>
      ))}
    </div>
  );
}
