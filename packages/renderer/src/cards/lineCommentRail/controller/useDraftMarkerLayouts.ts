import { useMemo } from "react";
import {
  buildDraftMarkers,
  savedDraftEntriesFrom,
} from "../draftMarkers.js";
import {
  boxForRange,
  layoutMarkers,
  lineKey,
  type LineBox,
  type LineHit,
  type LineRange,
} from "../lineGeometry.js";

interface UseDraftMarkerLayoutsOptions {
  hoverHit: LineHit | null;
  selectionLines: LineRange | null;
  popoverTarget: LineRange | null;
  savedDrafts: Record<string, string>;
  lineHeight: number;
  lineBoxes: LineBox[];
}

export function useDraftMarkerLayouts({
  hoverHit,
  selectionLines,
  popoverTarget,
  savedDrafts,
  lineHeight,
  lineBoxes,
}: UseDraftMarkerLayoutsOptions) {
  const hoverLines: LineRange | null =
    hoverHit !== null ? [hoverHit.line, hoverHit.line] : null;
  const visibleDraft = popoverTarget ?? selectionLines ?? hoverLines;
  const visibleDraftKey = visibleDraft !== null ? lineKey(visibleDraft) : null;
  const savedDraftEntries = useMemo(
    () => savedDraftEntriesFrom(savedDrafts),
    [savedDrafts],
  );
  const draftMarkerLayouts = useMemo(
    () =>
      layoutMarkers(
        buildDraftMarkers({
          savedDraftEntries,
          savedDrafts,
          visibleDraft,
          visibleDraftKey,
          popoverTarget,
          selectionLines,
          hoverHit,
          hoverLines,
        }),
        lineHeight,
        lineBoxes,
      ),
    [
      hoverHit,
      hoverLines,
      lineBoxes,
      lineHeight,
      popoverTarget,
      savedDraftEntries,
      savedDrafts,
      selectionLines,
      visibleDraft,
      visibleDraftKey,
    ],
  );
  const popoverTop =
    popoverTarget !== null
      ? boxForRange(popoverTarget, lineBoxes, lineHeight).center
      : 0;
  return { draftMarkerLayouts, popoverTop };
}
