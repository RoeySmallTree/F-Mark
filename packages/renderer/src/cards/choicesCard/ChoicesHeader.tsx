import { type JSX } from "react";
import { HelpCircle, MoreHorizontal } from "lucide-react";
import { ParticipantAvatar } from "../../components/ParticipantAvatar.js";
import { copyChoicesQuestion } from "./useChoicesCardModel.js";
import type { ChoicesCardModel } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  user: "user",
  agent: "agent",
  sm: "sm",
} as const;

interface ChoicesHeaderProps {
  model: ChoicesCardModel;
}

export function ChoicesHeader({ model }: ChoicesHeaderProps): JSX.Element {
  return (
    <div className="choices-head">
      <ParticipantAvatar
        participantId={model.who.id}
        kind={model.who.isUser ? NO_LOOSE_STRING_VALUES.user : NO_LOOSE_STRING_VALUES.agent}
        name={model.who.name}
        color={model.who.color}
        runtimeId={model.who.runtimeId}
        size={NO_LOOSE_STRING_VALUES.sm}
      />
      <span className="who">{model.who.name}</span>
      <span className="when">{model.formatTimestamp(model.event.timestamp)}</span>
      <span className="badge">
        <HelpCircle size={10} aria-hidden /> CHOOSE
      </span>
      <button
        type="button"
        className="menu"
        aria-label="Copy question"
        title="Copy question"
        onClick={() => copyChoicesQuestion(model)}
      >
        <MoreHorizontal size={14} aria-hidden />
      </button>
    </div>
  );
}
