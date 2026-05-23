/* ArbitraryGroupCard — expandable collapsible group containing arbitrary
   prose + tool-use items emitted mid-turn by the same participant.

   The kernel emits these events as they stream in. We bundle a contiguous
   run for one participant into a single "group" (see `projectFeed`) so the
   feed doesn't drown the reader in raw tool calls while a turn is still
   unfolding. Status tracks the lifecycle:

     streaming  → turn is still in flight; OPEN by default; title shows
                  elapsed-since-start and a "live" badge
     concluded  → followed by a named/unnamed prose from the same agent;
                  COLLAPSED by default
     ended      → turn-end seen before any concluding prose; COLLAPSED

   Clicking the header toggles open/closed regardless of status. The body
   delegates to `<EventCard>` for each child item, so prose/tool-use rendering
   stays consistent with the rest of the feed. */

import { useState, type JSX } from "react";
import type { AnyEventRecord, Participant } from "@f-mark/shared";
import type { ArbitraryGroup } from "../feed/projectFeed.js";
import { EventCard } from "./EventCard.js";

function parseTs(iso: string): Date {
  // F-Mark uses ISO compact: 20260523T100000Z → 2026-05-23T10:00:00Z
  const m = iso.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!m) return new Date(iso);
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`);
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`;
  const min = Math.floor(ms / 60_000);
  const sec = Math.round((ms % 60_000) / 1000);
  return sec === 0 ? `${min} min` : `${min} min ${sec} s`;
}

export interface ArbitraryGroupCardProps {
  group: ArbitraryGroup;
  now?: Date;
  participants?: Record<string, Participant>;
  comments?: AnyEventRecord[];
  allEvents?: AnyEventRecord[];
}

export function ArbitraryGroupCard({
  group,
  now = new Date(),
  participants = {},
  comments = [],
  allEvents = [],
}: ArbitraryGroupCardProps): JSX.Element {
  const [open, setOpen] = useState(group.status === "streaming");

  const start = parseTs(group.timeRangeStart);
  const endRef =
    group.status === "streaming" ? now : parseTs(group.timeRangeEnd);
  const elapsed = formatElapsed(endRef.getTime() - start.getTime());

  const toolLabel =
    group.toolCount === 0
      ? ""
      : group.toolCount === 1
        ? "1 tool"
        : `${group.toolCount} tools`;

  return (
    <div className={`arbitrary-group arbitrary-group--${group.status}`}>
      <button
        type="button"
        aria-label="toggle group"
        className="arbitrary-group-head"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="arbitrary-group-chevron" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
        <span className="arbitrary-group-title">
          {group.participant_id} · {elapsed}
          {toolLabel !== "" && <> · {toolLabel}</>}
          {group.status === "streaming" && (
            <span className="arbitrary-group-live"> · live</span>
          )}
        </span>
      </button>
      {open && (
        <div className="arbitrary-group-body">
          {group.items.map((ev) => (
            <EventCard
              key={ev.filename}
              event={ev}
              participants={participants}
              comments={comments}
              allEvents={allEvents}
            />
          ))}
        </div>
      )}
    </div>
  );
}
