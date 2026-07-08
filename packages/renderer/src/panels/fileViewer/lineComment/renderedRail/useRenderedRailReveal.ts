import { useEffect, type RefObject } from "react";
import type { PendingFileReveal } from "../../../../state/store.js";
import {
  boxForRange,
  normalizeLines,
  type LineBox,
} from "../lineMeasure.js";
import { relocateLine } from "../relocateLine.js";

interface UseRenderedRailRevealOptions {
  pendingFileReveal: PendingFileReveal | null;
  path: string;
  text: string;
  lineCount: number;
  lineHeight: number;
  wrapRef: RefObject<HTMLDivElement>;
  refreshLineBoxes(): LineBox[];
  clearFileReveal(): void;
}

export function useRenderedRailReveal({
  pendingFileReveal,
  path,
  text,
  lineCount,
  lineHeight,
  wrapRef,
  refreshLineBoxes,
  clearFileReveal,
}: UseRenderedRailRevealOptions): void {
  useEffect(() => {
    if (pendingFileReveal === null || pendingFileReveal.absPath !== path) return;
    const wrap = wrapRef.current;
    if (wrap === null) return;
    let targetLine: number | null = pendingFileReveal.line;
    if (
      pendingFileReveal.lineContext !== undefined ||
      pendingFileReveal.lines !== undefined
    ) {
      targetLine = relocateLine(
        text,
        pendingFileReveal.lineContext,
        pendingFileReveal.lines,
      ).line;
    }
    if (targetLine === null) {
      clearFileReveal();
      return;
    }
    const boxes = refreshLineBoxes();
    const box = boxForRange(
      normalizeLines([targetLine, targetLine], lineCount),
      boxes,
      lineHeight,
    );
    if (typeof wrap.scrollTo === "function") {
      wrap.scrollTo({ top: Math.max(0, box.top - 60), behavior: "smooth" });
    } else {
      wrap.scrollTop = Math.max(0, box.top - 60);
    }
    clearFileReveal();
  }, [
    pendingFileReveal,
    path,
    text,
    lineCount,
    lineHeight,
    wrapRef,
    refreshLineBoxes,
    clearFileReveal,
  ]);
}
