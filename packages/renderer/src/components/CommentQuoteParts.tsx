import type { JSX, MouseEvent } from "react";
import { FileText } from "lucide-react";
import { usePresentFile } from "../shell/usePresentFile.js";
import { fileRefLabel } from "../comments/commentQuote.js";
import type { LineRange } from "../panels/fileViewer/lineComment/lineMeasure.js";

interface CommentFileRefProps {
  filePath: string;
  lines?: LineRange;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
}

function relPath(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.slice(Math.max(0, parts.length - 3)).join("/");
}

export function CommentFileRef({
  filePath,
  lines,
  onClick,
}: CommentFileRefProps): JSX.Element {
  const presentFile = usePresentFile();
  const label = fileRefLabel(filePath, lines);
  const title =
    lines !== undefined
      ? `${filePath}:${lines[0]}${lines[1] !== lines[0] ? `-${lines[1]}` : ""}`
      : filePath;

  return (
    <button
      type="button"
      className="comment-file-ref tool-file-ref"
      title={title}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
        presentFile(filePath);
      }}
    >
      <FileText size={13} aria-hidden="true" />
      <span className="tool-file-ref-name">{label}</span>
      <span className="tool-file-ref-path">{relPath(filePath)}</span>
    </button>
  );
}

interface CommentQuoteBlockProps {
  quote: string;
  multiline?: boolean;
}

export function CommentQuoteBlock({
  quote,
  multiline = false,
}: CommentQuoteBlockProps): JSX.Element {
  return (
    <span
      className={[
        "comment-activity-target",
        multiline ? "comment-activity-target-multiline" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {quote}
    </span>
  );
}
