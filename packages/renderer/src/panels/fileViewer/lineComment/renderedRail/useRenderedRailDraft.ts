import {
  useCallback,
  useState,
  type MouseEvent,
  type RefObject,
} from "react";
import type { ProseMention } from "@f-mark/shared";
import { buildLineContext } from "../lineContext.js";
import {
  boxForRange,
  lineFromY,
  selectionLinesFromRange,
  type LineBox,
  type LineRange,
} from "../lineMeasure.js";
import type { FileCommentPoster } from "../useFileCommentPoster.js";

interface UseRenderedRailDraftOptions {
  contentRef: RefObject<HTMLDivElement>;
  lineBoxes: LineBox[];
  lineCount: number;
  lineHeight: number;
  text: string;
  path: string;
  poster: FileCommentPoster;
  refreshLineBoxes(): LineBox[];
}

interface RenderedRailDraftController {
  popoverTarget: LineRange | null;
  visibleDraft: LineRange | null;
  popoverTop: number;
  onMouseMove(event: MouseEvent<HTMLDivElement>): void;
  onMouseLeave(): void;
  onMouseUp(): void;
  openDraft(lines: LineRange): void;
  closeDraft(): void;
  submitDraft(content: string, mentions: ProseMention[]): Promise<void>;
}

function lineFromMouseEvent({
  event,
  content,
  lineBoxes,
  lineCount,
  lineHeight,
}: {
  event: MouseEvent<HTMLDivElement>;
  content: HTMLElement | null;
  lineBoxes: LineBox[];
  lineCount: number;
  lineHeight: number;
}): number | null {
  if (content === null) return null;
  const rect = content.getBoundingClientRect();
  const y = event.clientY - rect.top;
  if (y < 0 || y > rect.height) return null;
  return lineFromY(y, lineBoxes, lineCount, lineHeight);
}

function selectedRangeInside(root: HTMLElement): Range | null {
  const selection = window.getSelection();
  if (
    selection === null ||
    selection.rangeCount === 0 ||
    selection.isCollapsed ||
    selection.toString().trim().length === 0 ||
    selection.anchorNode === null ||
    selection.focusNode === null ||
    !root.contains(selection.anchorNode) ||
    !root.contains(selection.focusNode)
  ) {
    return null;
  }
  return selection.getRangeAt(0);
}

export function useRenderedRailDraft({
  contentRef,
  lineBoxes,
  lineCount,
  lineHeight,
  text,
  path,
  poster,
  refreshLineBoxes,
}: UseRenderedRailDraftOptions): RenderedRailDraftController {
  const [hoverLine, setHoverLine] = useState<number | null>(null);
  const [selectionLines, setSelectionLines] = useState<LineRange | null>(null);
  const [popoverTarget, setPopoverTarget] = useState<LineRange | null>(null);

  const draftLines =
    selectionLines ?? (hoverLine !== null ? [hoverLine, hoverLine] : null);
  const visibleDraft = (popoverTarget ?? draftLines) as LineRange | null;
  const popoverTop =
    popoverTarget !== null
      ? boxForRange(popoverTarget, lineBoxes, lineHeight).center
      : 0;

  function onMouseMove(event: MouseEvent<HTMLDivElement>): void {
    const line = lineFromMouseEvent({
      event,
      content: contentRef.current,
      lineBoxes,
      lineCount,
      lineHeight,
    });
    if (line !== null) setHoverLine(line);
  }

  function onMouseLeave(): void {
    if (popoverTarget === null) setHoverLine(null);
  }

  function onMouseUp(): void {
    const root = contentRef.current;
    if (root === null) return;
    const range = selectedRangeInside(root);
    if (range === null) return;
    const lines = selectionLinesFromRange(
      range,
      root,
      refreshLineBoxes(),
      lineCount,
      lineHeight,
      text,
    );
    if (lines !== null) setSelectionLines(lines);
  }

  function openDraft(lines: LineRange): void {
    if (!poster.canPost) return;
    setSelectionLines(lines);
    setPopoverTarget(lines);
  }

  const closeDraft = useCallback((): void => {
    setPopoverTarget(null);
    setSelectionLines(null);
    setHoverLine(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  const submitDraft = useCallback(
    async (content: string, mentions: ProseMention[]): Promise<void> => {
      if (popoverTarget === null) return;
      const lineContext = buildLineContext(text, popoverTarget);
      const filename = await poster.postFileComment({
        absPath: path,
        lines: popoverTarget,
        content,
        ...(mentions.length > 0 ? { mentions } : {}),
        lineContext,
      });
      if (filename !== null) closeDraft();
    },
    [closeDraft, popoverTarget, text, path, poster],
  );

  return {
    popoverTarget,
    visibleDraft,
    popoverTop,
    onMouseMove,
    onMouseLeave,
    onMouseUp,
    openDraft,
    closeDraft,
    submitDraft,
  };
}
