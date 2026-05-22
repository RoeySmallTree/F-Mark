/* TargetPill — the dashed user-tint chip shown above the compose box when
   commenting. Mirrors design.html's `.compose-target` block. */

import { type JSX } from "react";
import { MessageSquare, X } from "lucide-react";

interface Props {
  target: { file: string; lines?: [number, number] };
  onClose(): void;
}

function lineRangeLabel(lines: [number, number] | undefined): string | null {
  if (lines === undefined) return null;
  const [a, b] = lines;
  if (a === b) return `line ${a}`;
  return `lines ${a}–${b}`;
}

/** Trim event filenames like `20260522T120000Z_ag-c92e.prose.md` down to a
    short display string. We strip a leading timestamp + actor and the file
    extension when present. */
function shortTargetName(file: string): string {
  const m = /^[0-9TZ]+_[A-Za-z0-9-]+\.(.+)$/.exec(file);
  if (m !== null) return m[1] ?? file;
  return file;
}

export function TargetPill({ target, onClose }: Props): JSX.Element {
  const range = lineRangeLabel(target.lines);
  return (
    <div className="compose-target" role="status">
      <MessageSquare size={12} aria-hidden />
      <span>
        Commenting on{" "}
        <b
          style={{
            fontFamily: "var(--serif)",
            fontStyle: "italic",
            fontWeight: 600,
          }}
        >
          {shortTargetName(target.file)}
        </b>
        {range !== null && (
          <>
            {" "}
            · {range}
          </>
        )}
      </span>
      <button
        type="button"
        className="close"
        aria-label="Cancel comment target"
        onClick={onClose}
      >
        <X size={12} aria-hidden />
      </button>
    </div>
  );
}
