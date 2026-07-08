import type { AnyEventRecord, GetInboxResponse } from "@f-mark/shared";
import { readVisibleEvents } from "../events/visible.js";
import type { Paths } from "../paths.js";
import type { AgentStateStore } from "../services/agentState.js";
import {
  latestEventTimestamp,
  readCompassCursor,
  writeCompassCursor,
} from "./cursors.js";

export interface InboxReadInput {
  paths: Paths;
  state: AgentStateStore;
  sessionId: string;
  participantId: string;
  limit?: number;
  markSeen: boolean;
}

export interface InboxSnapshot extends GetInboxResponse {
  all_event_count: number;
}

function eventsForInbox(
  events: AnyEventRecord[],
  participantId: string,
  limit?: number,
): AnyEventRecord[] {
  const visible = events.filter((event) => event.participant_id !== participantId);
  if (limit === undefined || visible.length <= limit) return visible;
  return visible.slice(visible.length - limit);
}

export async function readInbox(input: InboxReadInput): Promise<InboxSnapshot> {
  const cursorBefore = await readCompassCursor(
    input.state,
    input.participantId,
    input.sessionId,
  );
  const allEvents = await readVisibleEvents(input.paths, input.sessionId, {
    since: cursorBefore ?? undefined,
  });
  const events = eventsForInbox(allEvents, input.participantId, input.limit);
  const cursorAfter =
    latestEventTimestamp(events) ??
    (input.limit === undefined ? latestEventTimestamp(allEvents) : null) ??
    cursorBefore;

  if (
    input.markSeen &&
    cursorAfter !== null &&
    cursorAfter !== cursorBefore
  ) {
    await writeCompassCursor(
      input.state,
      input.participantId,
      input.sessionId,
      cursorAfter,
    );
  }

  return {
    session_id: input.sessionId,
    participant_id: input.participantId,
    cursor_before: cursorBefore,
    cursor_after: cursorAfter,
    events,
    all_event_count: allEvents.length,
  };
}

export async function markInboxSeen(input: {
  paths: Paths;
  state: AgentStateStore;
  sessionId: string;
  participantId: string;
  timestamp?: string;
}): Promise<string | null> {
  const cursor =
    input.timestamp ??
    latestEventTimestamp(await readVisibleEvents(input.paths, input.sessionId, {}));
  if (cursor !== null) {
    await writeCompassCursor(
      input.state,
      input.participantId,
      input.sessionId,
      cursor,
    );
  }
  return cursor;
}
