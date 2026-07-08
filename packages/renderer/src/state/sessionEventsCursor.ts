import {
  normalizeTimestampForSort,
  toIsoTimestamp,
  type AnyEventRecord,
} from "@f-mark/shared";
import { loadMap, saveJson } from "./storagePersistence.js";

export const SESSION_EVENTS_CURSOR_STORAGE_KEY =
  "fmark.sessionEventsCursorBySession";

export interface SessionEventsCursor {
  schema: 1;
  path_id: string;
  path: string;
  session_id: string;
  last_checked_at: string;
  last_seen_event_at?: string;
}

export interface SessionEventsCursorPathMeta {
  path_id: string;
  path: string;
  session_id: string;
}

export function cursorMapKey(pathId: string, sessionId: string): string {
  return `${pathId}/${sessionId}`;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function normalizeCursor(
  value: unknown,
  key: string,
): SessionEventsCursor | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  if (candidate.schema !== 1) return undefined;
  if (!nonEmptyString(candidate.path_id)) return undefined;
  if (typeof candidate.path !== "string") return undefined;
  if (!nonEmptyString(candidate.session_id)) return undefined;
  if (!nonEmptyString(candidate.last_checked_at)) return undefined;
  if (
    candidate.last_seen_event_at !== undefined &&
    typeof candidate.last_seen_event_at !== "string"
  ) {
    return undefined;
  }
  if (cursorMapKey(candidate.path_id, candidate.session_id) !== key) {
    return undefined;
  }
  return {
    schema: 1,
    path_id: candidate.path_id,
    path: candidate.path,
    session_id: candidate.session_id,
    last_checked_at: candidate.last_checked_at,
    ...(candidate.last_seen_event_at !== undefined
      ? { last_seen_event_at: candidate.last_seen_event_at }
      : {}),
  };
}

export function loadSessionEventsCursorMap(): Record<
  string,
  SessionEventsCursor
> {
  return loadMap(SESSION_EVENTS_CURSOR_STORAGE_KEY, normalizeCursor);
}

export function saveSessionEventsCursorMap(
  map: Record<string, SessionEventsCursor>,
): void {
  saveJson(SESSION_EVENTS_CURSOR_STORAGE_KEY, map);
}

export function loadSessionEventsCursor(
  pathId: string,
  sessionId: string,
): SessionEventsCursor | undefined {
  return loadSessionEventsCursorMap()[cursorMapKey(pathId, sessionId)];
}

export function saveSessionEventsCursor(cursor: SessionEventsCursor): void {
  const map = loadSessionEventsCursorMap();
  map[cursorMapKey(cursor.path_id, cursor.session_id)] = cursor;
  saveSessionEventsCursorMap(map);
}

export function clearSessionEventsCursor(
  pathId: string,
  sessionId: string,
): void {
  const map = loadSessionEventsCursorMap();
  delete map[cursorMapKey(pathId, sessionId)];
  saveSessionEventsCursorMap(map);
}

export function readSince(
  cursor: SessionEventsCursor | undefined,
): string | undefined {
  if (cursor === undefined) return undefined;
  return subtractOneMillisecond(cursor.last_checked_at);
}

export function advanceCursor(
  existing: SessionEventsCursor | undefined,
  events: AnyEventRecord[],
  scanStartedAt: string,
  pathMeta: SessionEventsCursorPathMeta,
): SessionEventsCursor {
  const lastSeenEventAt = maxTimestamp(
    existing?.last_seen_event_at,
    latestEventTimestamp(events),
  );
  return {
    schema: 1,
    path_id: pathMeta.path_id,
    path: pathMeta.path,
    session_id: pathMeta.session_id,
    last_checked_at:
      maxTimestamp(existing?.last_checked_at, scanStartedAt) ?? scanStartedAt,
    ...(lastSeenEventAt !== undefined
      ? { last_seen_event_at: lastSeenEventAt }
      : {}),
  };
}

function compactTimestampToDate(ts: string): Date {
  const normalized = normalizeTimestampForSort(ts);
  return new Date(
    `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}T${normalized.slice(9, 11)}:${normalized.slice(11, 13)}:${normalized.slice(13, 15)}.${normalized.slice(16, 19)}Z`,
  );
}

function subtractOneMillisecond(ts: string): string {
  const date = compactTimestampToDate(ts);
  date.setUTCMilliseconds(date.getUTCMilliseconds() - 1);
  return toIsoTimestamp(date);
}

function maxTimestamp(
  a: string | undefined,
  b: string | undefined,
): string | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return normalizeTimestampForSort(a) >= normalizeTimestampForSort(b) ? a : b;
}

function latestEventTimestamp(events: AnyEventRecord[]): string | undefined {
  let latest: string | undefined;
  for (const event of events) latest = maxTimestamp(latest, event.timestamp);
  return latest;
}
