import type { AnyEventRecord } from "@f-mark/shared";

const NO_LOOSE_STRING_VALUES = {
  ag: "ag-",
  us: "us",
  ag2: "ag",
  turnEnd: "turn-end",
} as const;

export type TurnParticipantPrefix = "us" | "ag";

function nextTurnParticipantPrefix(
  participantId: string,
): TurnParticipantPrefix {
  return participantId.startsWith(NO_LOOSE_STRING_VALUES.ag) ? NO_LOOSE_STRING_VALUES.us : NO_LOOSE_STRING_VALUES.ag2;
}

export function currentTurnParticipantPrefix(
  events: readonly AnyEventRecord[],
): TurnParticipantPrefix {
  let latest: AnyEventRecord | null = null;
  for (const event of events) {
    if (event.kind !== NO_LOOSE_STRING_VALUES.turnEnd) continue;
    if (
      latest === null ||
      event.timestamp > latest.timestamp ||
      (event.timestamp === latest.timestamp && event.filename > latest.filename)
    ) {
      latest = event;
    }
  }
  return latest === null
    ? NO_LOOSE_STRING_VALUES.us
    : nextTurnParticipantPrefix(latest.participant_id);
}
