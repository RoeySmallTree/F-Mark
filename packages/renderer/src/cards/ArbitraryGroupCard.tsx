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
import type {
  AnyEventRecord,
  Participant,
  SubagentOutputEventRecord,
  SubagentRunEventRecord,
} from "@f-mark/shared";
import type { ArbitraryGroup } from "../feed/projectFeed.js";
import { EventCard } from "./EventCard.js";
import { SubagentBox } from "./SubagentBox.js";
import { whoOf } from "./format.js";

type SubagentEvent = SubagentRunEventRecord | SubagentOutputEventRecord;
type RenderItem =
  | { type: "event"; event: AnyEventRecord }
  | { type: "subagent"; key: string; events: SubagentEvent[] };

function parseTs(iso: string | null | undefined): Date | null {
  if (typeof iso !== "string" || iso.length === 0) return null;
  // F-Mark uses ISO compact: 20260523T100000Z → 2026-05-23T10:00:00Z
  const m = iso.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\.\d+)?Z$/,
  );
  const date = m
    ? new Date(
        `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] ?? ""}Z`,
      )
    : new Date(iso);
  return Number.isFinite(date.getTime()) ? date : null;
}

function formatElapsed(ms: number): string | null {
  if (!Number.isFinite(ms) || ms < 0) return null;
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`;
  const min = Math.floor(ms / 60_000);
  const sec = Math.round((ms % 60_000) / 1000);
  return sec === 0 ? `${min} min` : `${min} min ${sec} s`;
}

function groupElapsedLabel(group: ArbitraryGroup, now: Date): string | null {
  const start = parseTs(group.timeRangeStart);
  if (start === null) return null;
  const endRef =
    group.status === "streaming" ? now : parseTs(group.timeRangeEnd);
  if (endRef === null) return null;
  return formatElapsed(endRef.getTime() - start.getTime());
}

function isSubagentEvent(event: AnyEventRecord): event is SubagentEvent {
  return event.kind === "subagent-run" || event.kind === "subagent-output";
}

function subagentKey(event: SubagentEvent): string {
  return (
    event.payload.correlation_id ??
    event.payload.subagent_id ??
    event.filename
  );
}

function projectedItems(items: AnyEventRecord[]): RenderItem[] {
  const consumed = new Set<string>();
  const out: RenderItem[] = [];
  for (const event of items) {
    if (consumed.has(event.filename)) continue;
    if (!isSubagentEvent(event)) {
      out.push({ type: "event", event });
      continue;
    }
    const key = subagentKey(event);
    const events = items.filter(
      (candidate): candidate is SubagentEvent =>
        isSubagentEvent(candidate) && subagentKey(candidate) === key,
    );
    for (const subEvent of events) consumed.add(subEvent.filename);
    out.push({ type: "subagent", key, events });
  }
  return out;
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
  const [open, setOpen] = useState(
    group.status === "streaming" || group.hasFailedSubagent === true,
  );

  const who = whoOf(group.participant_id, participants);
  const participantName = who.name.trim() || group.participant_id;
  const elapsed = groupElapsedLabel(group, now);
  const timingLabel =
    elapsed ?? (group.status === "streaming" ? "working" : "");
  const toolLabel =
    group.toolCount === 0
      ? ""
      : group.toolCount === 1
        ? "1 tool"
        : `${group.toolCount} tools`;
  const subagentLabel =
    (group.subagentCount ?? 0) === 0
      ? ""
      : group.subagentCount === 1
        ? "1 sub-agent"
        : `${group.subagentCount ?? 0} sub-agents`;
  const accessLabel =
    (group.accessRequestCount ?? 0) === 0
      ? ""
      : group.accessRequestCount === 1
        ? "1 approval"
        : `${group.accessRequestCount ?? 0} approvals`;
  const renderItems = projectedItems(group.items);
  const countLabels = [toolLabel, accessLabel, subagentLabel].filter(
    (label): label is string => label.length > 0,
  );
  return (
    <div className={`toolbox${open ? " open" : ""}`} data-status={group.status}>
      <button
        type="button"
        className="tb-summary"
        aria-label="toggle group"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="chev" aria-hidden>
          ›
        </span>
        <span className="tb-ico" aria-hidden>
          {participantName.slice(0, 1).toUpperCase()}
        </span>
        <span
          className="tb-title"
          title={
            participantName === group.participant_id
              ? undefined
              : group.participant_id
          }
        >
          {participantName}
        </span>
        {countLabels.length > 0 ? (
          <span className="tb-count">{countLabels.join(" · ")}</span>
        ) : null}
        {timingLabel.length > 0 || group.status === "streaming" ? (
          <span
            className={`tb-status ${group.status === "streaming" ? "running" : "done"}`}
            aria-label="group status"
          >
            {group.status === "streaming" ? (
              <span className="run-dot" aria-hidden />
            ) : null}
            {timingLabel.length > 0 ? timingLabel : "working"}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="toolbox-body">
          {renderItems.map((item) =>
            item.type === "subagent" ? (
              <SubagentBox
                key={`subagent-${item.key}`}
                events={item.events}
                parentStatus={group.status}
              />
            ) : (
              <EventCard
                key={item.event.filename}
                event={item.event}
                participants={participants}
                comments={comments}
                allEvents={allEvents}
              />
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
