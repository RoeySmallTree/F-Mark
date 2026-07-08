import {
  lineKey,
  linesFromKey,
  rangeEquals,
  type LineBox,
  type LineHit,
  type LineRange,
} from "./lineGeometry.js";

const NO_LOOSE_STRING_VALUES = {
  savedDraft: "saved-draft",
  draft: "draft",
} as const;

export interface SavedDraftEntry {
  key: string;
  lines: LineRange;
  text: string;
}

export interface DraftMarker {
  key: string;
  lines: LineRange;
  kind: "draft" | "saved-draft";
  boxOverride?: LineBox;
}

export function savedDraftEntriesFrom(
  savedDrafts: Record<string, string>,
): SavedDraftEntry[] {
  return Object.entries(savedDrafts)
    .map(([key, text]) => {
      const lines = linesFromKey(key);
      return lines === null ? null : { key, lines, text };
    })
    .filter((entry): entry is SavedDraftEntry => entry !== null);
}

export function buildDraftMarkers({
  savedDraftEntries,
  savedDrafts,
  visibleDraft,
  visibleDraftKey,
  popoverTarget,
  selectionLines,
  hoverHit,
  hoverLines,
}: {
  savedDraftEntries: SavedDraftEntry[];
  savedDrafts: Record<string, string>;
  visibleDraft: LineRange | null;
  visibleDraftKey: string | null;
  popoverTarget: LineRange | null;
  selectionLines: LineRange | null;
  hoverHit: LineHit | null;
  hoverLines: LineRange | null;
}): DraftMarker[] {
  const draftMarkers: DraftMarker[] = savedDraftEntries
    .filter((entry) => entry.key !== visibleDraftKey)
    .map((entry) => ({
      key: entry.key,
      lines: entry.lines,
      kind: NO_LOOSE_STRING_VALUES.savedDraft,
    }));
  if (visibleDraft !== null) {
    const useHoverBox =
      popoverTarget === null &&
      selectionLines === null &&
      hoverHit !== null &&
      hoverLines !== null &&
      rangeEquals(visibleDraft, hoverLines);
    draftMarkers.push({
      key: `visible-${lineKey(visibleDraft)}`,
      lines: visibleDraft,
      kind:
        savedDrafts[lineKey(visibleDraft)] !== undefined
          ? NO_LOOSE_STRING_VALUES.savedDraft
          : NO_LOOSE_STRING_VALUES.draft,
      ...(useHoverBox ? { boxOverride: hoverHit.box } : {}),
    });
  }
  return draftMarkers;
}
