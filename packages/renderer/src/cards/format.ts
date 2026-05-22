/* Small formatting helpers shared by the card components. */

import type { Participant } from "@f-mark/shared";

export interface WhoInfo {
  name: string;
  initial: string;
  isUser: boolean;
}

/** Resolve a participant id to display info. Falls back to the id itself. */
export function whoOf(
  participantId: string,
  participants: Record<string, Participant>,
): WhoInfo {
  const p = participants[participantId];
  if (p === undefined) {
    return {
      name: participantId,
      initial: (participantId[0] ?? "?").toUpperCase(),
      isUser: participantId.startsWith("us-"),
    };
  }
  return {
    name: p.name,
    initial: (p.name[0] ?? "?").toUpperCase(),
    isUser: p.kind === "user",
  };
}

/** Convert a compact ISO-ish timestamp ("20260522T101530Z") to a short, locale-friendly "HH:MM" or "May 22, 10:15". */
export function formatWhen(ts: string): string {
  // Accept both compact "20260522T101530Z" and ISO "2026-05-22T10:15:30Z".
  let iso = ts;
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(ts);
  if (m !== null) {
    iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return ts;
  const now = new Date();
  const sameDay =
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth() &&
    d.getUTCDate() === now.getUTCDate();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  if (sameDay) return `${hh}:${mm}`;
  const months = [
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
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${hh}:${mm}`;
}
