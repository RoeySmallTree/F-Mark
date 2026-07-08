import type { JSX } from "react";
import type { Participant, ProseMention } from "@f-mark/shared";
import { AgentMentionPicker } from "../../../components/AgentMentionPicker.js";

interface LineCommentMentionPickerProps {
  currentSessionId: string | null;
  mentionAnchorRect: DOMRect | null;
  participants: Record<string, Participant>;
  selectedMentionIds: Set<string>;
  token: string | null;
  onCloseMentions(): void;
  onToggleMention(mention: ProseMention): void;
}

export function LineCommentMentionPicker({
  currentSessionId,
  mentionAnchorRect,
  participants,
  selectedMentionIds,
  token,
  onCloseMentions,
  onToggleMention,
}: LineCommentMentionPickerProps): JSX.Element | null {
  if (mentionAnchorRect === null) return null;
  return (
    <AgentMentionPicker
      anchorRect={mentionAnchorRect}
      sessionId={currentSessionId}
      token={token}
      participants={participants}
      selectedIds={selectedMentionIds}
      onSelect={onToggleMention}
      onClose={onCloseMentions}
    />
  );
}
