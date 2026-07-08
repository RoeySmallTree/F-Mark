import {
  useMemo,
  useState,
} from "react";
import type { ProseMention } from "@f-mark/shared";
import { toggleMentionSelection } from "./draftStore.js";

export function useMentionPickerState(defaultMentions: ProseMention[]) {
  const [selectedMentions, setSelectedMentions] = useState<ProseMention[]>([]);
  const [mentionAnchorRect, setMentionAnchorRect] = useState<DOMRect | null>(null);
  const selectedMentionIds = useMemo(
    () => new Set(selectedMentions.map((mention) => mention.participant_id)),
    [selectedMentions],
  );

  function openMentions(
    textarea: HTMLTextAreaElement | null,
    popover: HTMLDivElement | null,
  ): void {
    setMentionAnchorRect(
      textarea?.getBoundingClientRect() ??
        popover?.getBoundingClientRect() ??
        null,
    );
  }

  function closeMentions(): void {
    setMentionAnchorRect(null);
  }

  function resetMentionState(): void {
    setMentionAnchorRect(null);
    setSelectedMentions([]);
  }

  function selectDefaultMentions(): void {
    setSelectedMentions(defaultMentions);
  }

  function toggleMention(mention: ProseMention): void {
    setSelectedMentions((prev) => toggleMentionSelection(prev, mention));
  }

  return {
    selectedMentions,
    selectedMentionIds,
    mentionAnchorRect,
    openMentions,
    closeMentions,
    resetMentionState,
    selectDefaultMentions,
    toggleMention,
  };
}
