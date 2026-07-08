import {
  Columns,
  FileText,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import { useStore, type ViewMode } from "../../state/store.js";

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

export function ViewModeToggle(): JSX.Element {
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);

  return (
    <div className="view-toggle" role="tablist" aria-label="Feed view mode">
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
