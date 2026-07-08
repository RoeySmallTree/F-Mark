import type { JSX } from "react";
import { CommentAnchorSnippet } from "../../../components/lineCommentPopover/CommentAnchorSnippet.js";
import { CommentTargetHeader } from "../../../components/lineCommentPopover/CommentTargetHeader.js";
import { fixedPopoverStyle } from "../popoverPosition.js";
import { commentTargetPreview } from "../snippets.js";
import { LineCommentDraftTextarea } from "./LineCommentDraftTextarea.js";
import { LineCommentMentionPicker } from "./LineCommentMentionPicker.js";
import { LineCommentPopoverActions } from "./LineCommentPopoverActions.js";
import type { LineCommentPopoverProps } from "./types.js";

export function LineCommentPopoverView({
  props,
}: {
  props: LineCommentPopoverProps;
}): JSX.Element {
  return (
    <div
      ref={props.popoverRef}
      className="line-comment-popover is-fixed"
      style={fixedPopoverStyle(props.contentAnchor, props.popoverTop)}
    >
      <CommentTargetHeader
        title={props.title}
        lines={props.popoverTarget}
        onClose={props.onCloseDraft}
      />
      <CommentAnchorSnippet
        lines={props.popoverTarget}
        quotedLines={commentTargetPreview(
          props.content,
          props.popoverTarget,
          props.selectionPreview,
        )}
      />
      <LineCommentDraftTextarea
        draft={props.draft}
        setDraft={props.setDraft}
        textareaRef={props.textareaRef}
        onCloseDraft={props.onCloseDraft}
        onOpenMentions={props.onOpenMentions}
        onSubmit={props.onSubmit}
      />
      <LineCommentPopoverActions
        busy={props.busy}
        draft={props.draft}
        participants={props.participants}
        selectedMentions={props.selectedMentions}
        onOpenMentions={props.onOpenMentions}
        onSubmit={props.onSubmit}
      />
      <LineCommentMentionPicker
        currentSessionId={props.currentSessionId}
        mentionAnchorRect={props.mentionAnchorRect}
        participants={props.participants}
        selectedMentionIds={props.selectedMentionIds}
        token={props.token}
        onCloseMentions={props.onCloseMentions}
        onToggleMention={props.onToggleMention}
      />
    </div>
  );
}
