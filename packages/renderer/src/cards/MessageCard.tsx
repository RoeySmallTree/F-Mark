const NO_LOOSE_STRING_VALUES = {
  card: "card",
  msgCard: "msg-card",
  user: "user",
  agent: "agent",
  message: "message",
  narration: "narration",
  narrationClass: "is-narration",
} as const;

/* MessageCard — unnamed prose with no target. Renders short messages
   inline. Color stripe + small head row + rendered markdown body. */

import type { JSX } from "react";
import type { AnyEventRecord, Participant, ProsePayload } from "@f-mark/shared";
import { whoOf } from "./format.js";
import { LineCommentRail } from "./LineCommentRail.js";
import { EventCardHeader } from "./EventCardHeader.js";

interface Props {
  event: AnyEventRecord;
  participants: Record<string, Participant>;
  comments: AnyEventRecord[];
  /** Overrides `event.payload.content` — used to render a joined run of
     streamed prose deltas as one document while still anchoring line
     comments to `event` (the run's first delta). */
  content?: string;
  revealWords?: boolean;
  /** Toolbox prose runs render as internal narration, not feed messages. */
  variant?: "message" | "narration";
}

export function MessageCard({
  event,
  participants,
  comments,
  content,
  revealWords = false,
  variant = NO_LOOSE_STRING_VALUES.message,
}: Props): JSX.Element {
  const payload = event.payload as ProsePayload;
  const text = content ?? payload.content;
  const who = whoOf(event.participant_id, participants);
  const isNarration = variant === NO_LOOSE_STRING_VALUES.narration;
  const lane = who.isUser
    ? NO_LOOSE_STRING_VALUES.user
    : NO_LOOSE_STRING_VALUES.agent;
  const classes = [
    NO_LOOSE_STRING_VALUES.card,
    NO_LOOSE_STRING_VALUES.msgCard,
    lane,
    isNarration ? NO_LOOSE_STRING_VALUES.narrationClass : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (isNarration) {
    return (
      <article className={classes} data-event-kind="message">
        <div className="narration-panel">
          <LineCommentRail
            event={event}
            content={text}
            comments={comments}
            participants={participants}
            mode="rendered"
            className="narration-text"
            lineHeight={22}
            revealWords={revealWords}
          />
        </div>
      </article>
    );
  }

  return (
    <article className={classes} data-event-kind="message">
      <div className="stripe" aria-hidden />
      <div className="body">
        <EventCardHeader
          className="card-head"
          who={who}
          timestamp={event.timestamp}
        />
        <LineCommentRail
          event={event}
          content={text}
          comments={comments}
          participants={participants}
          mode="rendered"
          className="text"
          lineHeight={22}
          revealWords={revealWords}
        />
      </div>
    </article>
  );
}
