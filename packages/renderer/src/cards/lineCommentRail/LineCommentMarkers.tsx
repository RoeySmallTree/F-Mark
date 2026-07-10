import type { JSX } from "react";
import type { CommentTarget } from "../../state/store.js";
import { isMarkerEvent } from "../../comments/commentMarkers.js";
import { LineMarker } from "./LineMarker.js";
import { type AnchorGroup } from "./commentData.js";
import { targetMatches } from "./commentTargets.js";
import {
  lineLabel,
  rangeEquals,
  type LineRange,
  type MarkerLayout,
} from "./lineGeometry.js";
import type { DraftMarker } from "./draftMarkers.js";

const NO_LOOSE_STRING_VALUES = {
  existing: "existing",
  savedDraft: "saved-draft",
} as const;

function lineNumberLabel(lines: LineRange): string {
  return lines[0] === lines[1] ? String(lines[0]) : `${lines[0]}–${lines[1]}`;
}

export function ExistingCommentMarkers({
  layouts,
  activeTarget,
  filename,
  onFocusComments,
}: {
  layouts: MarkerLayout<AnchorGroup>[];
  activeTarget: CommentTarget | null;
  filename: string;
  onFocusComments: (lines: LineRange) => void;
}): JSX.Element {
  return (
    <div className="line-comment-rail line-comment-rail-existing" aria-hidden={false}>
      {layouts.map(({ item: a, visualCenter, box }) => (
        <LineMarker
          key={a.key}
          lines={a.lines}
          box={box}
          visualCenter={visualCenter}
          count={a.comments.filter((c) => !isMarkerEvent(c)).length}
          color={a.resolved ? "var(--green)" : a.color}
          active={targetMatches(activeTarget, filename, a.lines)}
          kind={NO_LOOSE_STRING_VALUES.existing}
          resolved={a.resolved}
          label={`Open ${a.comments.length === 1 ? "comment" : "comments"} on ${lineLabel(a.lines)}`}
          onClick={() => onFocusComments(a.lines)}
        />
      ))}
    </div>
  );
}

export function DraftLineNumbers({
  layouts,
  popoverTarget,
}: {
  layouts: MarkerLayout<DraftMarker>[];
  popoverTarget: LineRange | null;
}): JSX.Element {
  return (
    <div className="line-comment-number-rail" aria-hidden>
      {layouts.map(({ item, box }) => (
        <span
          key={item.key}
          className={[
            "line-comment-line-number",
            item.kind,
            popoverTarget !== null && rangeEquals(popoverTarget, item.lines)
              ? "active"
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={{ top: box.center }}
          data-target-lines={`${item.lines[0]}:${item.lines[1]}`}
        >
          {lineNumberLabel(item.lines)}
        </span>
      ))}
    </div>
  );
}

export function DraftCommentMarkers({
  layouts,
  popoverTarget,
  onOpenDraft,
}: {
  layouts: MarkerLayout<DraftMarker>[];
  popoverTarget: LineRange | null;
  onOpenDraft: (lines: LineRange) => void;
}): JSX.Element {
  return (
    <div className="line-comment-rail line-comment-rail-draft" aria-hidden={false}>
      {layouts.map(({ item, visualCenter, box }) => (
        <LineMarker
          key={item.key}
          lines={item.lines}
          box={box}
          visualCenter={visualCenter}
          count={null}
          color={item.kind === NO_LOOSE_STRING_VALUES.savedDraft ? "var(--agent)" : "var(--user)"}
          active={popoverTarget !== null && rangeEquals(popoverTarget, item.lines)}
          kind={item.kind}
          label={
            item.kind === NO_LOOSE_STRING_VALUES.savedDraft
              ? `Resume draft on ${lineLabel(item.lines)}`
              : `Add comment on ${lineLabel(item.lines)}`
          }
          onClick={() => onOpenDraft(item.lines)}
        />
      ))}
    </div>
  );
}
