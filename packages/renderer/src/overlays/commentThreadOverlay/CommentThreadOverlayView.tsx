import type { JSX } from "react";
import { X } from "lucide-react";
import { CommentThread } from "./CommentThread.js";
import type {
  CommentLineRange,
  CommentThreadOverlayController,
} from "./types.js";

type CommentThreadOverlayViewProps = CommentThreadOverlayController;

export function CommentThreadOverlayView({
  targetTitle,
  lines,
  quotedLines,
  threads,
  allTargetComments,
  participants,
  postReply,
  postResolve,
  postUnresolve,
  onClose,
}: CommentThreadOverlayViewProps): JSX.Element {
  return (
    <>
      <div className="overlay-head">
        <p className="comments-on">
          Comments on <b>{targetTitle}</b>
        </p>
        <button
          type="button"
          className="overlay-close"
          aria-label="Close thread"
          onClick={onClose}
        >
          <X size={14} aria-hidden />
        </button>
      </div>
      <div className="panel-scroll">
        {quotedLines !== null && lines !== undefined && (
          <AnchorSnippet lines={lines} quotedLines={quotedLines} />
        )}
        {threads.length === 0 ? (
          <EmptyThreadMessage />
        ) : (
          threads.map(({ root, resolved }) => (
            <CommentThread
              key={root.filename}
              root={root}
              allComments={allTargetComments}
              participants={participants}
              resolved={resolved}
              onReply={postReply}
              onResolve={postResolve}
              onUnresolve={postUnresolve}
            />
          ))
        )}
      </div>
    </>
  );
}

function AnchorSnippet({
  lines,
  quotedLines,
}: {
  lines: CommentLineRange;
  quotedLines: string;
}): JSX.Element {
  return (
    <div className="anchor-snippet">
      <span className="ln">
        Lines {lines[0]}
        {lines[1] !== lines[0] ? `-${lines[1]}` : ""}
      </span>
      "{quotedLines}"
    </div>
  );
}

function EmptyThreadMessage(): JSX.Element {
  return (
    <p
      style={{
        fontFamily: "var(--serif)",
        fontStyle: "italic",
        color: "var(--ink-3)",
        fontSize: 13,
      }}
    >
      No comments on this contribution yet.
    </p>
  );
}
