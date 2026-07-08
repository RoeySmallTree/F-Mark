import type { JSX, KeyboardEvent, MouseEvent } from "react";
import { GitFork, MoreVertical } from "lucide-react";

interface SessionRowControlsProps {
  sessionSlug: string;
  onOpenContextMenu: (event: MouseEvent<HTMLButtonElement>) => void;
  onOpenFork: (event: MouseEvent<HTMLButtonElement>) => void;
}

function stopButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
  event.stopPropagation();
}

export function SessionRowControls(
  props: SessionRowControlsProps,
): JSX.Element {
  const { sessionSlug, onOpenContextMenu, onOpenFork } = props;

  return (
    <>
      <button
        type="button"
        className="session-row-action"
        onClick={onOpenFork}
        onKeyDown={stopButtonKeyDown}
        aria-label={`Fork ${sessionSlug}`}
        title="Fork session"
      >
        <GitFork size={13} aria-hidden />
      </button>
      <button
        type="button"
        className="session-row-action"
        onClick={onOpenContextMenu}
        onKeyDown={stopButtonKeyDown}
        aria-label={`Session actions for ${sessionSlug}`}
        title="Session actions"
      >
        <MoreVertical size={13} aria-hidden />
      </button>
    </>
  );
}
