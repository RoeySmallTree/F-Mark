import { useCallback } from "react";
import { useDraftMarkerLayouts } from "./controller/useDraftMarkerLayouts.js";
import { useLineCommentRefs } from "./controller/useLineCommentRefs.js";
import { useLineDraftState } from "./controller/useLineDraftState.js";
import { useLineHoverSelection } from "./controller/useLineHoverSelection.js";
import { useMentionPickerState } from "./controller/useMentionPickerState.js";
import { usePopoverDismissal } from "./controller/usePopoverDismissal.js";
import { useSelectionDismissal } from "./controller/useSelectionDismissal.js";
import type { UseLineCommentControllerOptions } from "./controller/types.js";
import type { LineRange } from "./lineGeometry.js";
import { useLineMeasurements } from "./useLineMeasurements.js";

export function useLineCommentController({
  content,
  mode,
  lineHeight,
  defaultMentions,
}: UseLineCommentControllerOptions) {
  const refs = useLineCommentRefs();
  const draft = useLineDraftState();
  const mentions = useMentionPickerState(defaultMentions);
  const lineCount = Math.max(1, content.split(/\r?\n/).length);
  const { lineBoxes, refreshLineBoxes } = useLineMeasurements({
    contentRef: refs.contentRef,
    content,
    mode,
    lineCount,
    lineHeight,
  });
  const closeDraft = useCallback(() => {
    draft.closeDraft();
    mentions.resetMentionState();
  }, [draft, mentions]);
  const discardDraft = useCallback(() => {
    draft.discardDraft();
    mentions.resetMentionState();
  }, [draft, mentions]);
  const resetDraftState = useCallback(() => {
    draft.resetDraftState();
    mentions.resetMentionState();
  }, [draft, mentions]);
  const openDraft = useCallback((lines: LineRange) => {
    draft.openDraft(lines);
    mentions.selectDefaultMentions();
  }, [draft, mentions]);
  const openMentions = useCallback(() => {
    mentions.openMentions(refs.textareaRef.current, refs.popoverRef.current);
  }, [mentions, refs.popoverRef, refs.textareaRef]);
  const hover = useLineHoverSelection({
    content,
    contentRef: refs.contentRef,
    lineBoxes,
    lineCount,
    lineHeight,
    popoverTarget: draft.popoverTarget,
    refreshLineBoxes,
    clearSelectionState: draft.clearSelectionState,
    setSelectionLines: draft.setSelectionLines,
    setSelectionPreview: draft.setSelectionPreview,
  });
  usePopoverDismissal({
    popoverTarget: draft.popoverTarget,
    draft: draft.draft,
    textareaRef: refs.textareaRef,
    popoverRef: refs.popoverRef,
    wrapRef: refs.wrapRef,
    closeDraft,
  });
  useSelectionDismissal({
    popoverTarget: draft.popoverTarget,
    selectionLines: draft.selectionLines,
    wrapRef: refs.wrapRef,
    contentRef: refs.contentRef,
    clearSelectionState: draft.clearSelectionState,
  });
  const markers = useDraftMarkerLayouts({
    hoverHit: hover.hoverHit,
    selectionLines: draft.selectionLines,
    popoverTarget: draft.popoverTarget,
    savedDrafts: draft.savedDrafts,
    lineHeight,
    lineBoxes,
  });

  return {
    ...refs,
    ...draft,
    ...mentions,
    ...hover,
    ...markers,
    lineCount,
    lineBoxes,
    openDraft,
    openMentions,
    closeDraft,
    discardDraft,
    resetDraftState,
  };
}
