import type { JSX } from "react";
import type { AnyEventRecord } from "@f-mark/shared";
import { formatWhen, whoOf } from "../../cards/format.js";
import { ParticipantAvatar } from "../../components/ParticipantAvatar.js";

const NO_LOOSE_STRING_VALUES = {
  user: "user",
  agent: "agent",
  sm: "sm",
} as const;

interface ThreadMessageProps {
  event: AnyEventRecord;
  reply: boolean;
  content: string;
  who: ReturnType<typeof whoOf>;
}

export function ThreadMessage({
  event,
  reply,
  content,
  who,
}: ThreadMessageProps): JSX.Element {
  return (
    <div className={["thread-msg", reply ? "reply" : ""].join(" ").trim()}>
      <ParticipantAvatar
        participantId={who.id}
        kind={who.isUser ? NO_LOOSE_STRING_VALUES.user : NO_LOOSE_STRING_VALUES.agent}
        name={who.name}
        color={who.color}
        runtimeId={who.runtimeId}
        size={NO_LOOSE_STRING_VALUES.sm}
      />
      <div className="body">
        <div className="head">
          <span className="who">{who.name}</span>
          <span className="when">{formatWhen(event.timestamp)}</span>
        </div>
        <div className="txt">{content}</div>
      </div>
    </div>
  );
}
