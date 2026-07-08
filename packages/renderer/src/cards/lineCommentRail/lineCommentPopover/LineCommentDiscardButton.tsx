import type { JSX } from "react";
import { Trash2 } from "lucide-react";

interface LineCommentDiscardButtonProps {
  busy: boolean;
  isVisible: boolean;
  onDiscardDraft(): void;
}

export function LineCommentDiscardButton({
  busy,
  isVisible,
  onDiscardDraft,
}: LineCommentDiscardButtonProps): JSX.Element | null {
  if (!isVisible) return null;
  return (
    <button
      type="button"
      className="line-comment-discard"
      onClick={onDiscardDraft}
      disabled={busy}
    >
      <Trash2 size={12} aria-hidden />
      discard
    </button>
  );
}
