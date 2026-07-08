import type { Dispatch, RefObject, SetStateAction } from "react";
import type { Participant, ProseMention } from "@f-mark/shared";
import type { WhoInfo } from "../../format.js";
import type { LineRange } from "../lineGeometry.js";

export interface LineCommentPopoverProps {
  popoverRef: RefObject<HTMLDivElement>;
  textareaRef: RefObject<HTMLTextAreaElement>;
  contentAnchor: HTMLElement | null;
  popoverTarget: LineRange;
  popoverTop: number;
  title: string;
  content: string;
  currentWho: WhoInfo;
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  savedDrafts: Record<string, string>;
  busy: boolean;
  selectionPreview: string | null;
  participants: Record<string, Participant>;
  selectedMentions: ProseMention[];
  selectedMentionIds: Set<string>;
  mentionAnchorRect: DOMRect | null;
  currentSessionId: string | null;
  token: string | null;
  onOpenMentions(): void;
  onCloseMentions(): void;
  onToggleMention(mention: ProseMention): void;
  onCloseDraft(): void;
  onDiscardDraft(): void;
  onSubmit(): Promise<void>;
}
