import { useEffect, useRef, type JSX } from "react";
import { ThreadCard } from "../../panels/right/comments/ThreadCard.js";
import { useRightCommentsController } from "../../panels/right/comments/useRightCommentsController.js";
import type { LineRange } from "../../cards/lineCommentRail/lineGeometry.js";
import { fixedThreadPopoverStyle } from "../../cards/lineCommentRail/popoverPosition.js";
import { CommentAnchorSnippet } from "./CommentAnchorSnippet.js";
import { CommentTargetHeader } from "./CommentTargetHeader.js";

interface InlineCommentThreadPopoverProps {
  groupKey: string;
  title: string;
  lines: LineRange;
  quote: string | null;
  contentAnchor: HTMLElement | null;
  lineBottomWithinAnchor: number;
  onClose(): void;
}

export function InlineCommentThreadPopover({
  groupKey,
  title,
  lines,
  quote,
  contentAnchor,
  lineBottomWithinAnchor,
  onClose,
}: InlineCommentThreadPopoverProps): JSX.Element | null {
  const popoverRef = useRef<HTMLDivElement>(null);
  const controller = useRightCommentsController();
  const group = controller.groups.find((item) => item.key === groupKey);
  const messageCount =
    group?.roots.reduce((sum, root) => sum + 1 + root.replies.length, 0) ?? 0;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
    }
    function onPointerDown(event: PointerEvent): void {
      const node = popoverRef.current;
      if (node === null || node.contains(event.target as Node)) return;
      onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [onClose]);

  if (group === undefined) return null;

  const resolvedQuote =
    [quote, group.quote].find(
      (item) => typeof item === "string" && item.trim().length > 0,
    ) ?? null;

  return (
    <div
      ref={popoverRef}
      className="line-comment-popover inline-comment-thread is-fixed"
      style={fixedThreadPopoverStyle(contentAnchor, lineBottomWithinAnchor)}
      onClick={(event) => event.stopPropagation()}
    >
      <CommentTargetHeader
        title={title}
        lines={lines}
        commentCount={messageCount}
        onClose={onClose}
      />
      {resolvedQuote !== null ? (
        <CommentAnchorSnippet lines={lines} quotedLines={resolvedQuote} />
      ) : null}
      <div className="inline-comment-thread-body">
        <ThreadCard
          group={group}
          participants={controller.participants}
          currentWho={controller.currentWho}
          active={true}
          replyDrafts={controller.replyDrafts}
          replyMentions={controller.replyMentions}
          editing={controller.editing}
          busyKey={controller.busyKey}
          actions={controller.actions}
        />
      </div>
    </div>
  );
}
