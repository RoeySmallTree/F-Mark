/* Log filter — pure data + pure filtering. The popover UI writes one of
   these values; <RightLog> applies it to the local event list.

   The kernel's GET /events accepts `kinds` (CSV) and `participant`
   (singular) — not multi-participant, not date ranges, not named-only.
   So we fetch the whole list and filter locally. Cheap for POC sessions. */

import type { AnyEventRecord, EventKind } from "@f-mark/shared";
import { isNamedAnchor } from "@f-mark/shared";

export type LogFilterRange = "all" | "today" | "7d" | "30d" | "custom";

export interface LogFilter {
  kinds: string[]; // empty = all
  participants: string[]; // empty = all
  range: LogFilterRange;
  customStart?: string; // ISO datetime-local string
  customEnd?: string;
  namedOnly: boolean;
}

export const DEFAULT_FILTER: LogFilter = {
  kinds: [],
  participants: [],
  range: "all",
  namedOnly: false,
};

/* Available kinds, in the order they should appear in the popover. The
   `choice` kind exists in the log but is consumed inside ChoicesCard;
   it's useful to surface in the filter for transparency. Typed as
   `readonly EventKind[]` so future additions to `EventKind` in @f-mark/shared
   surface as a compile-time hint here (rather than silently dropping the
   new kind from the filter UI). */
export const FILTERABLE_KINDS: readonly EventKind[] = [
  "prose",
  "choices",
  "choice",
  "turn-end",
  "todo",
  "html",
  "file",
  "tool-use",
];

export function hasActiveFilter(filter: LogFilter): boolean {
  return (
    filter.kinds.length > 0 ||
    filter.participants.length > 0 ||
    filter.range !== "all" ||
    filter.namedOnly
  );
}

export function activeFilterCount(filter: LogFilter): number {
  let count = 0;
  if (filter.kinds.length > 0) count += filter.kinds.length;
  if (filter.participants.length > 0) count += filter.participants.length;
  if (filter.range !== "all") count += 1;
  if (filter.namedOnly) count += 1;
  return count;
}

/* Parse the event timestamp into a Date. Events use the compact
   "20260522T101530Z" form (see filenames.ts in shared). */
export function parseEventTimestamp(ts: string): Date | null {
  let iso = ts;
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(ts);
  if (m !== null) {
    iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
  }
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

interface RangeBounds {
  start: Date | null;
  end: Date | null;
}

function startOfToday(now: Date): Date {
  // Events are stored as UTC ISO; use the UTC day boundary so the filter
  // is deterministic across timezones.
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export function rangeBounds(
  filter: LogFilter,
  now: Date = new Date(),
): RangeBounds {
  if (filter.range === "all") return { start: null, end: null };
  if (filter.range === "today") {
    return { start: startOfToday(now), end: null };
  }
  if (filter.range === "7d") {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    return { start, end: null };
  }
  if (filter.range === "30d") {
    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    return { start, end: null };
  }
  // custom
  const start =
    typeof filter.customStart === "string" && filter.customStart.length > 0
      ? new Date(filter.customStart)
      : null;
  const end =
    typeof filter.customEnd === "string" && filter.customEnd.length > 0
      ? new Date(filter.customEnd)
      : null;
  return {
    start: start !== null && !Number.isNaN(start.getTime()) ? start : null,
    end: end !== null && !Number.isNaN(end.getTime()) ? end : null,
  };
}

export function applyFilter(
  events: AnyEventRecord[],
  filter: LogFilter,
  now: Date = new Date(),
): AnyEventRecord[] {
  const bounds = rangeBounds(filter, now);
  const kindSet = new Set(filter.kinds);
  const participantSet = new Set(filter.participants);

  return events.filter((ev) => {
    if (kindSet.size > 0 && !kindSet.has(ev.kind)) return false;
    if (participantSet.size > 0 && !participantSet.has(ev.participant_id)) {
      return false;
    }
    if (bounds.start !== null || bounds.end !== null) {
      const d = parseEventTimestamp(ev.timestamp);
      if (d === null) return false;
      if (bounds.start !== null && d < bounds.start) return false;
      if (bounds.end !== null && d > bounds.end) return false;
    }
    if (filter.namedOnly) {
      /* Only top-level named anchors qualify — named SUB-blocks are
         consumed inside their parent doc and never standalone, so they
         shouldn't show in the "named only" filter. */
      if (!isNamedAnchor(ev)) return false;
    }
    return true;
  });
}
