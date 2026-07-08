import type { JSX } from "react";
import { MessageSquare, X } from "lucide-react";
import { lineLabel, type LineRange } from "../../cards/lineCommentRail/lineGeometry.js";

const COMMENT_COUNT_LABELS = {
  singular: "comment",
  plural: "comments",
} as const;

interface CommentTargetHeaderProps {
  title: string;
  lines: LineRange;
  commentCount?: number;
  onClose(): void;
}

export function CommentTargetHeader({
  title,
  lines,
  commentCount,
  onClose,
}: CommentTargetHeaderProps): JSX.Element {
  const countLabel =
    commentCount === undefined
      ? lineLabel(lines)
      : `${lineLabel(lines)} · ${commentCount} ${
          commentCount === 1
            ? COMMENT_COUNT_LABELS.singular
            : COMMENT_COUNT_LABELS.plural
        }`;

  return (
    <div className="line-comment-target-head">
      <MessageSquare size={14} aria-hidden className="line-comment-target-icon" />
      <div className="line-comment-target-meta">
        <b title={title}>{title}</b>
        <span>{countLabel}</span>
      </div>
      <button
        type="button"
        className="line-comment-close"
        aria-label="Close comment popover"
        onClick={onClose}
      >
        <X size={13} aria-hidden />
      </button>
    </div>
  );
}
