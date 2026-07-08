import type { JSX } from "react";
import { CommentAnchorSnippet } from "../../../../components/lineCommentPopover/CommentAnchorSnippet.js";
import { CommentTargetHeader } from "../../../../components/lineCommentPopover/CommentTargetHeader.js";
import { AgentMentionPicker } from "../../../../components/AgentMentionPicker.js";
import { FileCommentDraftActions } from "./FileCommentDraftActions.js";
import { lineLabel } from "./model.js";
import type {
  FileCommentDraftController,
  FileCommentDraftPopoverProps,
} from "./types.js";

interface FileCommentDraftPopoverViewProps
  extends FileCommentDraftPopoverProps {
  controller: FileCommentDraftController;
}

export function FileCommentDraftPopoverView({
  title,
  lines,
  snippet,
  busy,
  style,
  className,
  onClose,
  controller,
}: FileCommentDraftPopoverViewProps): JSX.Element {
  return (
    <div
      ref={controller.popoverRef}
      className={["line-comment-popover", "fv-line-comment-popover", className]
        .filter(Boolean)
        .join(" ")}
      style={style}
    >
      <CommentTargetHeader title={title} lines={lines} onClose={onClose} />
      <CommentAnchorSnippet lines={lines} quotedLines={snippet.length > 0 ? snippet : lineLabel(lines)} />
      <textarea
        ref={controller.textareaRef}
        value={controller.draft}
        onChange={(e) => controller.onDraftChange(e.target.value)}
        placeholder="Add a comment…"
        rows={3}
        aria-label={`Comment on ${lineLabel(lines)}`}
        onKeyDown={controller.onDraftKeyDown}
      />
      <FileCommentDraftActions busy={busy} controller={controller} />
      {controller.mentionAnchorRect !== null ? (
        <AgentMentionPicker
          anchorRect={controller.mentionAnchorRect}
          sessionId={controller.currentSessionId}
          token={controller.token}
          participants={controller.participants}
          selectedIds={controller.selectedMentionIds}
          onSelect={controller.onToggleMention}
          onClose={controller.onCloseMentions}
        />
      ) : null}
    </div>
  );
}
