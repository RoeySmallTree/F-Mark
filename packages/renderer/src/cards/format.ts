const NO_LOOSE_STRING_VALUES = {
  us: "us-",
  user: "user",
} as const;

/* Small formatting helpers shared by the card components. */

import type { Participant } from "@f-mark/shared";

export interface WhoInfo {
  id: string;
  name: string;
  initial: string;
  isUser: boolean;
  color?: string;
  runtimeId?: string | null;
}

/** Resolve a participant id to display info. Falls back to the id itself. */
export function whoOf(
  participantId: string,
  participants: Record<string, Participant>,
): WhoInfo {
  const p = participants[participantId];
  if (p === undefined) {
    return {
      id: participantId,
      name: participantId,
      initial: (participantId[0] ?? "?").toUpperCase(),
      isUser: participantId.startsWith(NO_LOOSE_STRING_VALUES.us),
      runtimeId: null,
    };
  }
  return {
    id: participantId,
    name: p.name,
    initial: (p.name[0] ?? "?").toUpperCase(),
    isUser: p.kind === NO_LOOSE_STRING_VALUES.user,
    color: p.color,
    runtimeId: p.runtime_id ?? null,
  };
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Format an event timestamp for display. Recent times render as relative
 *  ("just now", "5 minutes ago", "3 hours ago", "2 days ago"); anything
 *  older falls back to a local-time date+time ("May 22, 10:15" or
 *  "May 22, 2024, 10:15" when the year differs). */
export function formatWhen(ts: string): string {
  // Accept both compact "20260522T101530Z" / "20260522T101530.478Z" and
  // standard ISO "2026-05-22T10:15:30(.478)?Z".
  let iso = ts;
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\.\d+)?Z$/.exec(ts);
  if (m !== null) {
    const frac = m[7] ?? "";
    iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${frac}Z`;
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return ts;

  const now = new Date();
  const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);

  if (diffSec < 45) return "just now";
  if (diffSec < 90) return "1 minute ago";

  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minutes ago`;

  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return diffHr === 1 ? "1 hour ago" : `${diffHr} hours ago`;

  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return diffDay === 1 ? "1 day ago" : `${diffDay} days ago`;

  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const base = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === now.getFullYear()
    ? `${base}, ${hh}:${mm}`
    : `${base}, ${d.getFullYear()}, ${hh}:${mm}`;
}
