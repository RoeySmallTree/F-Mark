import type { JSX } from "react";
import { ParticipantAvatar } from "../../components/ParticipantAvatar.js";
import { formatWhen } from "../format.js";
import type { TodoCardHeaderModel } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  user: "user",
  agent: "agent",
  sm: "sm",
} as const;

interface TodoCardHeaderProps {
  model: TodoCardHeaderModel;
}

export function TodoCardHeader({
  model,
}: TodoCardHeaderProps): JSX.Element {
  const { who, timestamp, removed, done, wip } = model;

  return (
    <div className="todo-head">
      <ParticipantAvatar
        participantId={who.id}
        kind={who.isUser ? NO_LOOSE_STRING_VALUES.user : NO_LOOSE_STRING_VALUES.agent}
        name={who.name}
        color={who.color}
        runtimeId={who.runtimeId}
        size={NO_LOOSE_STRING_VALUES.sm}
      />
      <span className="who">{who.name}</span>
      <span className="when">{"\u00b7 "}{formatWhen(timestamp)}</span>
      <span className="status">
        {removed
          ? "todo removed"
          : done
            ? "todo completed"
            : wip
              ? "todo in progress"
              : "todo created"}
      </span>
    </div>
  );
}
