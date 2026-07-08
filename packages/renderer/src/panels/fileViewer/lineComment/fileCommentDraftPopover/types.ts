import type {
  CSSProperties,
  KeyboardEvent,
  RefObject,
} from "react";
import type { Participant, ProseMention } from "@f-mark/shared";
import type { WhoInfo } from "../../../../cards/format.js";

export type LineRange = [number, number];

export interface FileCommentDraftPopoverProps {
  /** Display title — usually the file basename. */
  title: string;
  lines: LineRange;
  /** Short preview of the selected source lines (shown as a quote). */
  snippet: string;
  busy: boolean;
  /** Absolute position within the popover's positioned ancestor. */
  style?: CSSProperties;
  className?: string;
  /** Default agents to tag (every agent attached to this session). */
  defaultMentions: ProseMention[];
  onSubmit(content: string, mentions: ProseMention[]): void;
  onClose(): void;
}

export interface FileCommentDraftController {
  popoverRef: RefObject<HTMLDivElement>;
  textareaRef: RefObject<HTMLTextAreaElement>;
  currentWho: WhoInfo;
  participants: Record<string, Participant>;
  currentSessionId: string | null;
  token: string | null;
  draft: string;
  selectedMentions: ProseMention[];
  selectedMentionIds: Set<string>;
  mentionAnchorRect: DOMRect | null;
  onDraftChange(value: string): void;
  onDraftKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void;
  onOpenMentions(): void;
  onCloseMentions(): void;
  onToggleMention(mention: ProseMention): void;
  onSubmit(): void;
}
