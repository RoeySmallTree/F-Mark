import { normalizeTimestampForSort, type AnyEventRecord } from "@f-mark/shared";
import type { AgentStateStore } from "../services/agentState.js";

export function latestEventTimestamp(
  events: Pick<AnyEventRecord, "timestamp" | "filename">[],
): string | null {
  if (events.length === 0) return null;
  return [...events].sort((a, b) => {
    const t = normalizeTimestampForSort(a.timestamp).localeCompare(
      normalizeTimestampForSort(b.timestamp),
    );
    return t !== 0 ? t : a.filename.localeCompare(b.filename);
  })[events.length - 1]!.timestamp;
}

export async function readCompassCursor(
  state: AgentStateStore,
  participantId: string,
  sessionId: string,
): Promise<string | null> {
  return state.readInboxCursor(participantId, sessionId);
}

export async function writeCompassCursor(
  state: AgentStateStore,
  participantId: string,
  sessionId: string,
  cursor: string,
): Promise<void> {
  await state.writeInboxCursor(participantId, sessionId, cursor);
}
