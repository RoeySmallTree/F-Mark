import type { MouseEvent } from "react";
import {
  lineHitFromY,
  type LineBox,
  type LineHit,
} from "../lineGeometry.js";

export interface ContentSelection {
  range: Range;
  text: string;
}

export function currentContentSelection(
  root: HTMLElement | null,
): ContentSelection | null {
  const sel = window.getSelection();
  if (
    root === null ||
    sel === null ||
    sel.rangeCount === 0 ||
    sel.isCollapsed ||
    sel.toString().trim().length === 0 ||
    sel.anchorNode === null ||
    sel.focusNode === null ||
    !root.contains(sel.anchorNode) ||
    !root.contains(sel.focusNode)
  ) {
    return null;
  }
  return { range: sel.getRangeAt(0), text: sel.toString().trim() };
}

export function lineHitFromMouseEvent(
  e: MouseEvent<HTMLDivElement>,
  root: HTMLElement | null,
  lineBoxes: LineBox[],
  lineCount: number,
  lineHeight: number,
): LineHit | null {
  const target = e.target;
  if (root === null || !(target instanceof Node) || !root.contains(target)) {
    return null;
  }
  const rect = root.getBoundingClientRect();
  const y = e.clientY - rect.top;
  if (y < 0 || y > rect.height) return null;
  return lineHitFromY(y, lineBoxes, lineCount, lineHeight);
}
