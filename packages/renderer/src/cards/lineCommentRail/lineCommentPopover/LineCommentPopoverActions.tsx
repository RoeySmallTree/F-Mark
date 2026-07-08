import type { JSX } from "react";
import { SendHorizontal } from "lucide-react";
import type { Participant, ProseMention } from "@f-mark/shared";
import { MentionTagButton } from "../../../components/lineCommentPopover/MentionTagButton.js";

interface LineCommentPopoverActionsProps {
  busy: boolean;
  draft: string;
  participants: Record<string, Participant>;
  selectedMentions: ProseMention[];
  onOpenMentions(): void;
  onSubmit(): Promise<void>;
}

export function LineCommentPopoverActions({
  busy,
  draft,
  participants,
  selectedMentions,
  onOpenMentions,
  onSubmit,
}: LineCommentPopoverActionsProps): JSX.Element {
  return (
    <div className="line-comment-popover-actions">
      <MentionTagButton
        busy={busy}
        participants={participants}
        selectedMentions={selectedMentions}
        onOpenMentions={onOpenMentions}
      />
      <button
        type="button"
        onClick={() => void onSubmit()}
        disabled={busy || draft.trim().length === 0}
      >
        Comment
        <SendHorizontal size={13} aria-hidden />
      </button>
    </div>
  );
}
