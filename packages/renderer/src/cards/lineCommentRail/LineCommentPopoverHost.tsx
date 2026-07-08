import type { JSX } from "react";
import type {
  Participant,
  ProseMention,
} from "@f-mark/shared";
import type { WhoInfo } from "../format.js";
import { LineCommentPopover } from "./LineCommentPopover.js";
import type { useLineCommentController } from "./useLineCommentController.js";

type LineCommentController = ReturnType<typeof useLineCommentController>;

export function LineCommentPopoverHost({
  rail,
  content,
  title,
  currentWho,
  busy,
  participants,
  currentSessionId,
  token,
  onSubmit,
}: {
  rail: LineCommentController;
  content: string;
  title: string;
  currentWho: WhoInfo;
  busy: boolean;
  participants: Record<string, Participant>;
  currentSessionId: string | null;
  token: string | null;
  onSubmit: (lines: LineCommentController["popoverTarget"], draft: string) => Promise<void>;
}): JSX.Element | null {
  if (rail.popoverTarget === null) return null;
  return (
    <LineCommentPopover
      popoverRef={rail.popoverRef}
      textareaRef={rail.textareaRef}
      contentAnchor={rail.contentRef.current}
      popoverTarget={rail.popoverTarget}
      popoverTop={rail.popoverTop}
      title={title}
      content={content}
      currentWho={currentWho}
      draft={rail.draft}
      setDraft={rail.setDraft}
      savedDrafts={rail.savedDrafts}
      busy={busy}
      selectionPreview={rail.selectionPreview}
      participants={participants}
      selectedMentions={rail.selectedMentions}
      selectedMentionIds={rail.selectedMentionIds}
      mentionAnchorRect={rail.mentionAnchorRect}
      currentSessionId={currentSessionId}
      token={token}
      onOpenMentions={rail.openMentions}
      onCloseMentions={rail.closeMentions}
      onToggleMention={(mention: ProseMention) => rail.toggleMention(mention)}
      onCloseDraft={rail.closeDraft}
      onDiscardDraft={rail.discardDraft}
      onSubmit={() => onSubmit(rail.popoverTarget, rail.draft)}
    />
  );
}
