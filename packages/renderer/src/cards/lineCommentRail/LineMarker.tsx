import type { CSSProperties, JSX } from "react";
import { MessageSquare, Plus } from "lucide-react";
import type { LineBox, LineRange } from "./lineGeometry.js";

const MARKER_KINDS = {
  existing: "existing",
} as const;

interface MarkerProps {
  lines: LineRange;
  box: LineBox;
  visualCenter?: number;
  count: number | null;
  color: string;
  active: boolean;
  kind: "draft" | "saved-draft" | "existing";
  resolved?: boolean;
  label: string;
  onClick(): void;
}

export function LineMarker({
  lines,
  box,
  visualCenter,
  count,
  color,
  active,
  kind,
  resolved = false,
  label,
  onClick,
}: MarkerProps): JSX.Element {
  const anchorTop = box.top;
  const anchorBottom = box.bottom;
  const iconCenter = visualCenter ?? box.center;
  const top = Math.min(anchorTop, iconCenter - 15);
  const bottom = Math.max(anchorBottom, iconCenter + 15);
  const style = {
    top,
    height: bottom - top,
    "--rail-color": color,
    "--bar-top": `${anchorTop - top + 2}px`,
    "--bar-bottom": `${bottom - anchorBottom + 2}px`,
    "--icon-top": `${iconCenter - top}px`,
  } as CSSProperties;
  return (
    <div
      className={[
        "line-comment-anchor",
        kind,
        active ? "active" : "",
        resolved ? "resolved" : "",
      ]
        .join(" ")
        .trim()}
      style={style}
      data-target-lines={`${lines[0]}:${lines[1]}`}
    >
      <span className="line-comment-bar" aria-hidden />
      <button
        type="button"
        className={[
          "line-comment-marker",
          "line-comment-hit",
          kind,
          active ? "active" : "",
          resolved ? "resolved" : "",
        ]
          .join(" ")
          .trim()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClick();
        }}
        aria-label={label}
      >
        <span className="line-comment-icon" aria-hidden>
          {kind === MARKER_KINDS.existing ? (
            <MessageSquare size={13} />
          ) : (
            <Plus size={13} />
          )}
        </span>
        {count !== null && count > 1 && (
          <span className="line-comment-count" aria-hidden>
            {count}
          </span>
        )}
      </button>
    </div>
  );
}
