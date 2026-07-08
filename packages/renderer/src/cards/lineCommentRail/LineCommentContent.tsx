import type { JSX } from "react";
import { MarkdownRenderer, type MarkdownMode } from "../../render/MarkdownRenderer.js";
import {
  boxForRange,
  type LineBox,
  type LineRange,
} from "./lineGeometry.js";

export function LineCommentContent({
  content,
  mode,
  className,
  revealWords,
  highlightLines,
  lineBoxes,
  lineHeight,
}: {
  content: string;
  mode: MarkdownMode;
  className?: string;
  revealWords?: boolean;
  highlightLines: LineRange | null;
  lineBoxes: LineBox[];
  lineHeight: number;
}): JSX.Element {
  const highlightBox =
    highlightLines !== null ? boxForRange(highlightLines, lineBoxes, lineHeight) : null;
  return (
    <>
      {highlightBox !== null && (
        <div
          className="line-comment-highlight"
          aria-hidden
          style={{
            top: highlightBox.top,
            height: highlightBox.bottom - highlightBox.top,
          }}
        />
      )}
      <MarkdownRenderer
        content={content}
        mode={mode}
        className={className}
        revealWords={revealWords}
      />
    </>
  );
}
