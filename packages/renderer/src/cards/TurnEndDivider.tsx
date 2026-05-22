/* TurnEndDivider — horizontal rule with side .user / .agent class based on
   whose turn ended. */

import { type JSX } from "react";
import type { AnyEventRecord, Participant } from "@f-mark/shared";
import { formatWhen, whoOf } from "./format.js";

interface Props {
  event: AnyEventRecord;
  participants: Record<string, Participant>;
}

export function TurnEndDivider({ event, participants }: Props): JSX.Element {
  const who = whoOf(event.participant_id, participants);
  const side = who.isUser ? "user" : "agent";
  return (
    <div
      className={`turn-end ${side}`}
      role="separator"
      aria-label={`${who.name}'s turn ended`}
      data-event-kind="turn-end"
    >
      <span className="line" aria-hidden />
      <span className="label">
        <span className="dot" aria-hidden />
        {who.name}'s turn ended · {formatWhen(event.timestamp)}
      </span>
      <span className="line" aria-hidden />
    </div>
  );
}
