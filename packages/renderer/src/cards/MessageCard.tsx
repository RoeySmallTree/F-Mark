/* MessageCard — unnamed prose with no target. Renders short messages
   inline. Color stripe + small head row + rendered markdown body. */

import type { JSX } from "react";
import type { AnyEventRecord, Participant, ProsePayload } from "@f-mark/shared";
import { formatWhen, whoOf } from "./format.js";
import { LineCommentRail } from "./LineCommentRail.js";
import { ParticipantAvatar } from "../components/ParticipantAvatar.js";

interface Props {
  event: AnyEventRecord;
  participants: Record<string, Participant>;
  comments: AnyEventRecord[];
}

export function MessageCard({
  event,
  participants,
  comments,
}: Props): JSX.Element {
  const payload = event.payload as ProsePayload;
  const who = whoOf(event.participant_id, participants);
  const classes = ["card", "msg-card", who.isUser ? "user" : "agent"].join(" ");
  return (
    <article className={classes} data-event-kind="message">
      <div className="stripe" aria-hidden />
      <div className="body">
        <div className="card-head">
          <ParticipantAvatar
            participantId={who.id}
            kind={who.isUser ? "user" : "agent"}
            name={who.name}
            color={who.color}
            runtimeId={who.runtimeId}
            size="sm"
          />
          <span className="who">{who.name}</span>
          <span className="when">{formatWhen(event.timestamp)}</span>
        </div>
        <LineCommentRail
          event={event}
          content={payload.content}
          comments={comments}
          participants={participants}
          mode="rendered"
          className="text"
          lineHeight={22}
        />
      </div>
    </article>
  );
}
