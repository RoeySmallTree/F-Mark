import { useEffect } from "react";
import type { RefObject } from "react";
import type { LineRange } from "../lineGeometry.js";

interface UsePopoverDismissalOptions {
  popoverTarget: LineRange | null;
  draft: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  popoverRef: RefObject<HTMLElement | null>;
  wrapRef: RefObject<HTMLElement | null>;
  closeDraft: () => void;
}

export function usePopoverDismissal({
  popoverTarget,
  draft,
  textareaRef,
  popoverRef,
  wrapRef,
  closeDraft,
}: UsePopoverDismissalOptions): void {
  useEffect(() => {
    if (popoverTarget !== null) textareaRef.current?.focus();
  }, [popoverTarget, textareaRef]);

  useEffect(() => {
    if (popoverTarget === null) return;
    function onDocumentMouseDown(e: globalThis.MouseEvent): void {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (popoverRef.current?.contains(target) === true) return;
      if (wrapRef.current?.contains(target) === true) {
        const el = target instanceof Element ? target : target.parentElement;
        if (el?.closest(".line-comment-hit") !== null) return;
      }
      closeDraft();
    }
    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, [closeDraft, draft, popoverRef, popoverTarget, wrapRef]);
}
