import type { CSSProperties, JSX, ReactNode } from "react";
import { ParticipantAvatar } from "../components/ParticipantAvatar.js";
import { formatWhen, type WhoInfo } from "./format.js";

const NO_LOOSE_STRING_VALUES = {
  user: "user",
  agent: "agent",
  sm: "sm",
} as const;

interface EventCardHeaderProps {
  className: string;
  style?: CSSProperties;
  who: WhoInfo;
  timestamp: string;
  children?: ReactNode;
}

export function EventCardHeader({
  className,
  style,
  who,
  timestamp,
  children,
}: EventCardHeaderProps): JSX.Element {
  return (
    <div className={className} style={style}>
      <span className="card-speaker">
        <ParticipantAvatar
          participantId={who.id}
          kind={who.isUser ? NO_LOOSE_STRING_VALUES.user : NO_LOOSE_STRING_VALUES.agent}
          name={who.name}
          color={who.color}
          runtimeId={who.runtimeId}
          size={NO_LOOSE_STRING_VALUES.sm}
        />
        <span className="who">{who.name}</span>
      </span>
      <span className="when">{formatWhen(timestamp)}</span>
      {children}
    </div>
  );
}
