import { useState } from "react";
import {
  lineKey,
  rangeEquals,
  type LineRange,
} from "../lineGeometry.js";
import {
  savedDraftsAfterClear,
  savedDraftsAfterPersist,
} from "./draftStore.js";

export function useLineDraftState() {
  const [selectionLines, setSelectionLines] = useState<LineRange | null>(null);
  const [selectionPreview, setSelectionPreview] = useState<string | null>(null);
  const [popoverTarget, setPopoverTarget] = useState<LineRange | null>(null);
  const [draft, setDraft] = useState("");
  const [savedDrafts, setSavedDrafts] = useState<Record<string, string>>({});

  function clearSelectionState(): void {
    setSelectionLines(null);
    setSelectionPreview(null);
  }

  function clearSavedDraft(lines: LineRange): void {
    setSavedDrafts((prev) => savedDraftsAfterClear(prev, lines));
  }

  function persistOrClearDraft(lines: LineRange, value: string): void {
    setSavedDrafts((prev) => savedDraftsAfterPersist(prev, lines, value));
  }

  function resetDraftState(): void {
    setPopoverTarget(null);
    setSelectionLines(null);
    setSelectionPreview(null);
    setDraft("");
    window.getSelection()?.removeAllRanges();
  }

  function closeDraft(): void {
    if (popoverTarget !== null) persistOrClearDraft(popoverTarget, draft);
    resetDraftState();
  }

  function discardDraft(): void {
    if (popoverTarget !== null) clearSavedDraft(popoverTarget);
    resetDraftState();
  }

  function openDraft(lines: LineRange): void {
    if (selectionLines === null || !rangeEquals(selectionLines, lines)) {
      setSelectionPreview(null);
    }
    setSelectionLines(lines);
    setPopoverTarget(lines);
    setDraft(savedDrafts[lineKey(lines)] ?? "");
  }

  return {
    selectionLines,
    setSelectionLines,
    selectionPreview,
    setSelectionPreview,
    popoverTarget,
    draft,
    setDraft,
    savedDrafts,
    clearSelectionState,
    clearSavedDraft,
    closeDraft,
    discardDraft,
    openDraft,
    resetDraftState,
  };
}
