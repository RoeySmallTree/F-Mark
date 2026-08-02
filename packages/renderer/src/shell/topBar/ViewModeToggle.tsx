import {
  Columns,
  FileText,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useStore, type ViewMode } from "../../state/store.js";

const NO_LOOSE_STRING_VALUES = {
  activeIndexVar: "--vm-index",
} as const;

const VIEW_MODE_OPTIONS: Array<{
  mode: ViewMode;
  label: string;
  title: string;
  Icon: LucideIcon;
}> = [
  {
    mode: "everything",
    label: "Everything",
    title: "Show every event",
    Icon: Columns,
  },
  {
    mode: "document",
    label: "Document",
    title: "Show only named prose",
    Icon: FileText,
  },
  {
    mode: "conversation",
    label: "Conversation",
    title: "Show only messages and turns",
    Icon: MessageSquare,
  },
];

/* The active pill's offset is an index, not a measured position: the toggle
   sits in the top bar, and measuring on every mode change would mean a
   layout pass per click and drift whenever the font or labels change. */
function indicatorStyle(activeIndex: number): CSSProperties {
  return {
    [NO_LOOSE_STRING_VALUES.activeIndexVar as string]: activeIndex,
  };
}

export function ViewModeToggle(): JSX.Element {
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);
  const activeIndex = Math.max(
    VIEW_MODE_OPTIONS.findIndex((option) => option.mode === viewMode),
    0,
  );

  return (
    <div className="view-toggle" role="tablist" aria-label="Feed view mode">
      <span
        aria-hidden="true"
        className="viewmode-indicator"
        style={indicatorStyle(activeIndex)}
      />
      {VIEW_MODE_OPTIONS.map(({ mode, label, title, Icon }) => (
        <button
          key={mode}
          type="button"
          role="tab"
          aria-selected={viewMode === mode}
          className={viewMode === mode ? "active" : ""}
          onClick={() => setViewMode(mode)}
          title={title}
        >
          <Icon size={12} aria-hidden="true" />
          <span className="view-toggle-label">{label}</span>
        </button>
      ))}
    </div>
  );
}
