import { Search, Settings } from "lucide-react";

interface ParticipantStripActionsProps {
  visible: boolean;
  onOpenSearch?: () => void;
  onOpenSettings?: () => void;
  searchLabel: string;
}

export function ParticipantStripActions({
  visible,
  onOpenSearch,
  onOpenSettings,
  searchLabel,
}: ParticipantStripActionsProps): JSX.Element | null {
  if (!visible) return null;
  return (
    <div className="participant-strip-actions">
      {onOpenSearch !== undefined ? (
        <button type="button" className="icon-btn" title={searchLabel} aria-label={searchLabel} onClick={onOpenSearch}>
          <Search size={15} aria-hidden="true" />
        </button>
      ) : null}
      {onOpenSettings !== undefined ? (
        <button type="button" className="icon-btn" title="Settings" aria-label="Open settings" onClick={onOpenSettings}>
          <Settings size={15} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
