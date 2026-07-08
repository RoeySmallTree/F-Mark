import type { JSX, ReactNode } from "react";
import { X } from "lucide-react";
import { ParticipantAvatar } from "../ParticipantAvatar.js";

const NO_LOOSE_STRING_VALUES = {
  user: "user",
  agent: "agent",
  sm: "sm",
} as const;

interface LineCommentAuthorInfo {
  id: string;
  name: string;
  color?: string;
  runtimeId?: string | null;
  isUser: boolean;
}

interface LineCommentPopoverHeaderProps {
  actions?: ReactNode;
  currentWho: LineCommentAuthorInfo;
  lineLabel: string;
  onClose(): void;
}

export function LineCommentPopoverHeader({
  actions,
  currentWho,
  lineLabel,
  onClose,
}: LineCommentPopoverHeaderProps): JSX.Element {
  return (
    <div className="line-comment-popover-head">
      <ParticipantAvatar
        participantId={currentWho.id}
        kind={currentWho.isUser ? NO_LOOSE_STRING_VALUES.user : NO_LOOSE_STRING_VALUES.agent}
        name={currentWho.name}
        color={currentWho.color}
        runtimeId={currentWho.runtimeId}
        size={NO_LOOSE_STRING_VALUES.sm}
      />
      <div className="line-comment-author">
        <b>{currentWho.name}</b>
        <span>{lineLabel}</span>
      </div>
      {actions}
      <button
        type="button"
        className="line-comment-close"
        aria-label="Close comment popover"
        onClick={onClose}
      >
        <X size={13} aria-hidden />
      </button>
    </div>
  );
}
