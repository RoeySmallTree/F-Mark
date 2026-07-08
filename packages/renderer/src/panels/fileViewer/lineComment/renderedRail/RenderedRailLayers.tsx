import type { JSX, ReactNode, RefObject } from "react";
import type { ProseMention } from "@f-mark/shared";
import type { CommentTarget } from "../../../../state/store.js";
import {
  FileCommentDraftPopover,
  fileCommentLineLabel,
} from "../FileCommentDraftPopover.js";
import { snippetForLines } from "../lineContext.js";
import {
  boxForRange,
  normalizeLines,
  type LineBox,
  type LineRange,
} from "../lineMeasure.js";
import {
  rangeEquals,
  type RenderedCommentAnchor,
} from "./commentAnchors.js";
import { RenderedRailMarker } from "./RenderedRailMarker.js";
import { fixedPopoverStyle } from "../../../../cards/lineCommentRail/popoverPosition.js";

const NO_LOOSE_STRING_VALUES = {
  file: "file",
  existing: "existing",
  draft: "draft",
} as const;

interface RenderedRailContentProps {
  contentRef: RefObject<HTMLDivElement>;
  highlightLines: LineRange | null;
  lineBoxes: LineBox[];
  lineHeight: number;
  children: ReactNode;
}

export function RenderedRailContent({
  contentRef,
  highlightLines,
  lineBoxes,
  lineHeight,
  children,
}: RenderedRailContentProps): JSX.Element {
  const highlightBox =
    highlightLines !== null
      ? boxForRange(highlightLines, lineBoxes, lineHeight)
      : null;
  return (
    <div ref={contentRef} className="fv-line-comment-content commentable-content">
      {highlightBox !== null ? (
        <div
          className="fv-line-comment-highlight"
          aria-hidden
          style={{
            top: highlightBox.top,
            height: highlightBox.bottom - highlightBox.top,
          }}
        />
      ) : null}
      {children}
    </div>
  );
}

interface ExistingCommentRailProps {
  anchors: RenderedCommentAnchor[];
  activeTarget: CommentTarget | null;
  lineBoxes: LineBox[];
  lineHeight: number;
  lineCount: number;
  onFocusComments(lines: LineRange): void;
}

export function ExistingCommentRail({
  anchors,
  activeTarget,
  lineBoxes,
  lineHeight,
  lineCount,
  onFocusComments,
}: ExistingCommentRailProps): JSX.Element {
  return (
    <div className="fv-line-comment-rail fv-line-comment-rail-existing" aria-hidden={false}>
      {anchors.map((anchor) => {
        const box = boxForRange(anchor.lines, lineBoxes, lineHeight);
        const active =
          activeTarget !== null &&
          activeTarget.kind === NO_LOOSE_STRING_VALUES.file &&
          activeTarget.lines !== undefined &&
          rangeEquals(
            normalizeLines(activeTarget.lines, lineCount),
            anchor.lines,
          );
        return (
          <RenderedRailMarker
            key={anchor.key}
            lines={anchor.lines}
            box={box}
            count={anchor.count}
            active={active}
            kind={NO_LOOSE_STRING_VALUES.existing}
            resolved={anchor.resolved}
            label={`Open ${anchor.count === 1 ? "comment" : "comments"} on ${fileCommentLineLabel(anchor.lines)}`}
            onClick={() => onFocusComments(anchor.lines)}
          />
        );
      })}
    </div>
  );
}

interface DraftCommentRailProps {
  visibleDraft: LineRange | null;
  canPost: boolean;
  popoverTarget: LineRange | null;
  lineBoxes: LineBox[];
  lineHeight: number;
  onOpenDraft(lines: LineRange): void;
}

export function DraftCommentRail({
  visibleDraft,
  canPost,
  popoverTarget,
  lineBoxes,
  lineHeight,
  onOpenDraft,
}: DraftCommentRailProps): JSX.Element {
  return (
    <div className="fv-line-comment-rail fv-line-comment-rail-draft" aria-hidden={false}>
      {visibleDraft !== null && canPost ? (
        <RenderedRailMarker
          lines={visibleDraft}
          box={boxForRange(visibleDraft, lineBoxes, lineHeight)}
          count={null}
          active={popoverTarget !== null}
          kind={NO_LOOSE_STRING_VALUES.draft}
          label={`Add comment on ${fileCommentLineLabel(visibleDraft)}`}
          onClick={() => onOpenDraft(visibleDraft)}
        />
      ) : null}
    </div>
  );
}

interface RenderedDraftPopoverProps {
  popoverTarget: LineRange | null;
  title: string;
  text: string;
  busy: boolean;
  defaultMentions: ProseMention[];
  anchor: HTMLElement | null;
  popoverTop: number;
  onSubmit(content: string, mentions: ProseMention[]): void;
  onClose(): void;
}

export function RenderedDraftPopover({
  popoverTarget,
  title,
  text,
  busy,
  defaultMentions,
  anchor,
  popoverTop,
  onSubmit,
  onClose,
}: RenderedDraftPopoverProps): JSX.Element | null {
  if (popoverTarget === null) return null;
  return (
    <FileCommentDraftPopover
      title={title}
      lines={popoverTarget}
      snippet={snippetForLines(text, popoverTarget)}
      busy={busy}
      defaultMentions={defaultMentions}
      className="fv-rendered-comment-popover is-fixed"
      style={fixedPopoverStyle(anchor, popoverTop)}
      onSubmit={onSubmit}
      onClose={onClose}
    />
  );
}
