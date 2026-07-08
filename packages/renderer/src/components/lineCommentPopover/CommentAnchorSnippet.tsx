import type { JSX } from "react";
import type { LineRange } from "../../cards/lineCommentRail/lineGeometry.js";

interface CommentAnchorSnippetProps {
  lines: LineRange;
  quotedLines: string;
}

export function CommentAnchorSnippet({
  lines,
  quotedLines,
}: CommentAnchorSnippetProps): JSX.Element {
  const lineText =
    lines[0] === lines[1]
      ? `line ${lines[0]}`
      : `lines ${lines[0]}-${lines[1]}`;

  return (
    <div className="comment-anchor-snippet">
      <span className="comment-anchor-snippet-label">{lineText}</span>
      <pre className="comment-anchor-snippet-body">{quotedLines}</pre>
    </div>
  );
}
