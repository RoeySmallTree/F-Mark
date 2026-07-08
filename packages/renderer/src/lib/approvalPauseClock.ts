import type {
  AccessRequestPayload,
  AccessResponsePayload,
  AnyEventRecord,
} from "@f-mark/shared";

const NO_LOOSE_STRING_VALUES = {
  accessResponse: "access-response",
  accessRequest: "access-request",
  open: "open",
} as const;

const TS_COMPACT = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\.\d+)?Z$/;

export function eventTimestampMs(ts: string | null | undefined): number | null {
  if (typeof ts !== "string" || ts.length === 0) return null;
  const m = TS_COMPACT.exec(ts);
  const iso = m
    ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] ?? ""}Z`
    : ts;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

interface Interval {
  startMs: number;
  endMs: number;
}

export interface ApprovalPauseClock {
  activeEndMs: number;
  closedPauseMs: number;
  openPauseStartMs: number | null;
}

interface ApprovalPauseClockOptions {
  participantIds?: Iterable<string>;
  requestEvents?: readonly AnyEventRecord[];
  sinceMs?: number | null;
  untilMs?: number;
}

interface ApprovalElapsedOptions extends ApprovalPauseClockOptions {
  startMs: number;
  endMs: number;
}

function payloadTimestampMs(value: unknown): number | null {
  return typeof value === "string" ? eventTimestampMs(value) : null;
}

function requestStartMs(event: AnyEventRecord): number | null {
  const payload = event.payload as AccessRequestPayload;
  return eventTimestampMs(event.timestamp) ?? payloadTimestampMs(payload.created_at);
}

function responseEndMs(event: AnyEventRecord): number | null {
  const payload = event.payload as AccessResponsePayload;
  return payloadTimestampMs(payload.responded_at) ?? eventTimestampMs(event.timestamp);
}

function latestResponseTimes(
  events: readonly AnyEventRecord[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const event of events) {
    if (event.kind !== NO_LOOSE_STRING_VALUES.accessResponse) continue;
    const payload = event.payload as AccessResponsePayload;
    const endedAt = responseEndMs(event);
    if (endedAt === null) continue;
    const prev = out.get(payload.request_id);
    if (prev === undefined || endedAt >= prev) {
      out.set(payload.request_id, endedAt);
    }
  }
  return out;
}

function mergedDurationMs(intervals: Interval[], cutoffMs: number): number {
  const clipped = intervals
    .map((interval) => ({
      startMs: interval.startMs,
      endMs: Math.min(interval.endMs, cutoffMs),
    }))
    .filter((interval) => interval.endMs > interval.startMs)
    .sort((a, b) => a.startMs - b.startMs);

  let total = 0;
  let current: Interval | null = null;
  for (const interval of clipped) {
    if (current === null) {
      current = { ...interval };
      continue;
    }
    if (interval.startMs <= current.endMs) {
      current.endMs = Math.max(current.endMs, interval.endMs);
      continue;
    }
    total += current.endMs - current.startMs;
    current = { ...interval };
  }
  if (current !== null) total += current.endMs - current.startMs;
  return total;
}

export function approvalPauseClock(
  events: readonly AnyEventRecord[],
  {
    participantIds,
    requestEvents,
    sinceMs = null,
    untilMs = Date.now(),
  }: ApprovalPauseClockOptions = {},
): ApprovalPauseClock {
  const allowedParticipants =
    participantIds === undefined ? null : new Set(participantIds);
  const requests = requestEvents ?? events;
  const responseEvents =
    requestEvents === undefined ? events : [...events, ...requestEvents];
  const latestResponses = latestResponseTimes(responseEvents);
  const closedIntervals: Interval[] = [];
  let openPauseStartMs: number | null = null;

  for (const event of requests) {
    if (event.kind !== NO_LOOSE_STRING_VALUES.accessRequest) continue;
    if (
      allowedParticipants !== null &&
      !allowedParticipants.has(event.participant_id)
    ) {
      continue;
    }
    const payload = event.payload as AccessRequestPayload;
    const rawStartMs = requestStartMs(event);
    if (rawStartMs === null) continue;
    const startMs = sinceMs === null ? rawStartMs : Math.max(rawStartMs, sinceMs);
    if (startMs > untilMs) continue;

    const responseMs = latestResponses.get(payload.request_id);
    if (responseMs !== undefined) {
      const endMs = Math.min(Math.max(responseMs, startMs), untilMs);
      if (endMs > startMs) closedIntervals.push({ startMs, endMs });
      continue;
    }

    if (payload.status === NO_LOOSE_STRING_VALUES.open) {
      openPauseStartMs =
        openPauseStartMs === null ? startMs : Math.min(openPauseStartMs, startMs);
    }
  }

  const activeEndMs =
    openPauseStartMs === null ? untilMs : Math.min(untilMs, openPauseStartMs);
  return {
    activeEndMs,
    closedPauseMs: mergedDurationMs(closedIntervals, activeEndMs),
    openPauseStartMs,
  };
}

export function approvalAdjustedElapsedMs(
  events: readonly AnyEventRecord[],
  { startMs, endMs, ...options }: ApprovalElapsedOptions,
): number {
  const clock = approvalPauseClock(events, {
    ...options,
    sinceMs: startMs,
    untilMs: endMs,
  });
  return Math.max(0, clock.activeEndMs - startMs - clock.closedPauseMs);
}
