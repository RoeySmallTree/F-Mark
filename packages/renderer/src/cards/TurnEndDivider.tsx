const NO_LOOSE_STRING_VALUES = {
  us: "us",
  accessResponse: "access-response",
  turnEnd: "turn-end",
  user: "user",
  agent: "agent",
} as const;

/* TurnEndDivider — horizontal rule with side .user / .agent class based on
   whose turn ended. */

import { type JSX } from "react";
import type { AnyEventRecord, Participant } from "@f-mark/shared";
import { formatWhen, whoOf } from "./format.js";
import {
  approvalAdjustedElapsedMs,
  eventTimestampMs,
} from "../lib/approvalPauseClock.js";
import { formatElapsed } from "../lib/elapsed.js";

interface Props {
  event: AnyEventRecord;
  participants: Record<string, Participant>;
  allEvents?: AnyEventRecord[];
}

function turnStartMsBefore(
  turnEnd: AnyEventRecord,
  allEvents: readonly AnyEventRecord[],
): number | null {
  const endMs = eventTimestampMs(turnEnd.timestamp);
  if (endMs === null) return null;

  let boundaryMs: number | null = null;
  let earliestMs: number | null = null;
  for (const event of allEvents) {
    if (event.filename === turnEnd.filename) continue;
    const ms = eventTimestampMs(event.timestamp);
    if (ms === null || ms > endMs) continue;
    if (earliestMs === null || ms < earliestMs) earliestMs = ms;
    if (
      (event.participant_id.startsWith(NO_LOOSE_STRING_VALUES.us) &&
        event.kind !== NO_LOOSE_STRING_VALUES.accessResponse) ||
      event.kind === NO_LOOSE_STRING_VALUES.turnEnd
    ) {
      if (boundaryMs === null || ms > boundaryMs) boundaryMs = ms;
    }
  }
  return boundaryMs ?? earliestMs;
}

function turnElapsedLabel(
  event: AnyEventRecord,
  allEvents: readonly AnyEventRecord[],
): string | null {
  const startMs = turnStartMsBefore(event, allEvents);
  const endMs = eventTimestampMs(event.timestamp);
  if (startMs === null || endMs === null || endMs < startMs) return null;
  return formatElapsed(
    approvalAdjustedElapsedMs(allEvents, {
      participantIds: [event.participant_id],
      startMs,
      endMs,
    }),
  );
}

export function TurnEndDivider({
  event,
  participants,
  allEvents = [],
}: Props): JSX.Element {
  const who = whoOf(event.participant_id, participants);
  const side = who.isUser ? NO_LOOSE_STRING_VALUES.user : NO_LOOSE_STRING_VALUES.agent;
  const elapsed = turnElapsedLabel(event, allEvents);
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
        {who.name}'s turn ended
        {elapsed !== null ? ` · ${elapsed} elapsed` : ""} ·{" "}
        {formatWhen(event.timestamp)}
      </span>
      <span className="line" aria-hidden />
    </div>
  );
}
