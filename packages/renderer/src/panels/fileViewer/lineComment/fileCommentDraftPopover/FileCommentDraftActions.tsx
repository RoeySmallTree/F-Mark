import type { JSX } from "react";
import { SendHorizontal } from "lucide-react";
import { MentionTagButton } from "./MentionTagButton.js";
import type { FileCommentDraftController } from "./types.js";

interface FileCommentDraftActionsProps {
  busy: boolean;
  controller: FileCommentDraftController;
}

export function FileCommentDraftActions({
  busy,
  controller,
}: FileCommentDraftActionsProps): JSX.Element {
  return (
    <div className="line-comment-popover-actions">
      <MentionTagButton
        busy={busy}
        participants={controller.participants}
        selectedMentions={controller.selectedMentions}
        onOpenMentions={controller.onOpenMentions}
      />
      <button
        type="button"
        onClick={controller.onSubmit}
        disabled={busy || controller.draft.trim().length === 0}
      >
        Comment
        <SendHorizontal size={13} aria-hidden />
      </button>
    </div>
  );
}
