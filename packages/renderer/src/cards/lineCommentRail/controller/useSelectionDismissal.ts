import { useEffect } from "react";
import type { RefObject } from "react";
import { currentContentSelection } from "./selectionDom.js";
import type { LineRange } from "../lineGeometry.js";

interface UseSelectionDismissalOptions {
  popoverTarget: LineRange | null;
  selectionLines: LineRange | null;
  wrapRef: RefObject<HTMLElement | null>;
  contentRef: RefObject<HTMLElement | null>;
  clearSelectionState: () => void;
}

export function useSelectionDismissal({
  popoverTarget,
  selectionLines,
  wrapRef,
  contentRef,
  clearSelectionState,
}: UseSelectionDismissalOptions): void {
  useEffect(() => {
    if (popoverTarget !== null || selectionLines === null) return;
    function onDocumentMouseDown(e: globalThis.MouseEvent): void {
      if (e.target instanceof Node && wrapRef.current?.contains(e.target) === true) return;
      clearSelectionState();
    }
    function onSelectionChange(): void {
      if (currentContentSelection(contentRef.current) === null) clearSelectionState();
    }
    document.addEventListener("mousedown", onDocumentMouseDown);
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      document.removeEventListener("mousedown", onDocumentMouseDown);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, [clearSelectionState, contentRef, popoverTarget, selectionLines, wrapRef]);
}
