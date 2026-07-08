import { useState } from "react";
import type {
  MouseEvent,
  RefObject,
} from "react";
import { selectionLinesFromRange } from "../sourceSelection.js";
import {
  lineHitEquals,
  type LineBox,
  type LineHit,
  type LineRange,
} from "../lineGeometry.js";
import {
  currentContentSelection,
  lineHitFromMouseEvent,
} from "./selectionDom.js";

interface UseLineHoverSelectionOptions {
  content: string;
  contentRef: RefObject<HTMLElement | null>;
  lineBoxes: LineBox[];
  lineCount: number;
  lineHeight: number;
  popoverTarget: LineRange | null;
  refreshLineBoxes: () => LineBox[];
  clearSelectionState: () => void;
  setSelectionLines: (lines: LineRange | null) => void;
  setSelectionPreview: (preview: string | null) => void;
}

export function useLineHoverSelection(options: UseLineHoverSelectionOptions) {
  const [hoverHit, setHoverHit] = useState<LineHit | null>(null);

  function onMouseMove(e: MouseEvent<HTMLDivElement>): void {
    const hit = lineHitFromMouseEvent(
      e,
      options.contentRef.current,
      options.lineBoxes,
      options.lineCount,
      options.lineHeight,
    );
    if (hit !== null) setHoverHit((prev) => (lineHitEquals(prev, hit) ? prev : hit));
  }

  function onMouseLeave(): void {
    if (options.popoverTarget === null) setHoverHit(null);
  }

  function onMouseUp(): void {
    const root = options.contentRef.current;
    if (root === null) return;
    const selected = currentContentSelection(root);
    if (selected === null) {
      if (options.popoverTarget === null) options.clearSelectionState();
      return;
    }
    const lines = selectionLinesFromRange(
      selected.range,
      root,
      options.refreshLineBoxes(),
      options.lineCount,
      options.lineHeight,
      options.content,
    );
    if (lines !== null) {
      options.setSelectionLines(lines);
      options.setSelectionPreview(selected.text);
    }
  }

  return {
    hoverHit,
    onMouseMove,
    onMouseLeave,
    onMouseUp,
  };
}
