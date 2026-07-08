import { EVENT_KINDS, type AnyEventRecord } from "@f-mark/shared";
import type { ConsumedStub } from "../state/aggregate.js";

const STUB_TYPE = "stub";

export type GroupStatus = "streaming" | "concluded" | "ended";

export interface ArbitraryGroup {
  type: "group";
  participant_id: string;
  items: AnyEventRecord[];
  status: GroupStatus;
  toolCount: number;
  accessRequestCount?: number;
  subagentCount?: number;
  hasFailedSubagent?: boolean;
  timeRangeStart: string;
  timeRangeEnd: string;
}

export interface SingleEventItem {
  type: "event";
  event: AnyEventRecord;
  /** Feed read/position key, overriding `event.filename` when the row must
   *  advance past same-turn consumed blocks (a named anchor with adjacent
   *  appends). Left unset for ordinary rows. */
  rowReadKey?: string;
}

/** A "block was added to a document up-thread" row, standing in for one or
 *  more consumed blocks at their original timeline slot. */
export interface StubFeedItem {
  type: "stub";
  stub: ConsumedStub;
}

export type FeedItem = ArbitraryGroup | SingleEventItem | StubFeedItem;

/** Chronological injection marker for a consumed-block stub. `sortKey` is the
 *  newest block's filename, used to splice the marker into the sorted feed
 *  input at the block run's slot before grouping. */
export interface StubMarker {
  type: "stub";
  stub: ConsumedStub;
  sortKey: string;
}

export type FeedInput = AnyEventRecord | StubMarker;

export function isStubMarker(input: FeedInput): input is StubMarker {
  return (input as { type?: string }).type === STUB_TYPE;
}

const LATE_SELF_COMMENT_REORDER_MS = 5_000;

export const GROUP_STATUSES = {
  streaming: "streaming",
  concluded: "concluded",
  ended: "ended",
} as const satisfies Record<string, GroupStatus>;

const groupStatuses = GROUP_STATUSES;

const feedItemTypes = {
  group: "group",
  event: "event",
  stub: STUB_TYPE,
} as const;

const failedSubagentStatuses = {
  failed: "failed",
  cancelled: "cancelled",
} as const;

function isMidTurn(ev: AnyEventRecord): boolean {
  if (ev.kind === EVENT_KINDS.toolUse) return true;
  if (ev.kind === EVENT_KINDS.accessRequest) return true;
  if (ev.kind === EVENT_KINDS.subagentRun || ev.kind === EVENT_KINDS.subagentOutput) return true;
  if (ev.kind === EVENT_KINDS.prose) {
    const p = ev.payload as { arbitrary?: boolean };
    return p.arbitrary === true;
  }
  return false;
}

function isArbitraryProse(ev: AnyEventRecord): boolean {
  if (ev.kind !== EVENT_KINDS.prose) return false;
  const p = ev.payload as { arbitrary?: boolean };
  return p.arbitrary === true;
}

function isConcluding(ev: AnyEventRecord): boolean {
  if (ev.kind !== EVENT_KINDS.prose) return false;
  const p = ev.payload as { arbitrary?: boolean };
  return p.arbitrary !== true;
}

function isStandaloneResult(ev: AnyEventRecord): boolean {
  return (
    ev.kind === EVENT_KINDS.choices ||
    ev.kind === EVENT_KINDS.file ||
    ev.kind === EVENT_KINDS.flow ||
    ev.kind === EVENT_KINDS.html ||
    ev.kind === EVENT_KINDS.todo
  );
}

function timestampMs(ts: string): number | null {
  let iso = ts;
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\.\d+)?Z$/.exec(ts);
  if (m !== null) {
    const frac = m[7] ?? "";
    iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${frac}Z`;
  }
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function isNearAfter(first: string, second: string): boolean {
  const firstMs = timestampMs(first);
  const secondMs = timestampMs(second);
  if (firstMs === null || secondMs === null) return false;
  return (
    secondMs >= firstMs &&
    secondMs - firstMs <= LATE_SELF_COMMENT_REORDER_MS
  );
}

function finalize(
  group: AnyEventRecord[],
  participant: string,
  status: GroupStatus,
): ArbitraryGroup {
  const first = group[0];
  const last = group[group.length - 1];
  if (!first || !last) {
    throw new Error("projectFeed.finalize: group must be non-empty");
  }
  const toolCount = group.filter((e) => e.kind === EVENT_KINDS.toolUse).length;
  const accessRequestCount = group.filter((e) => e.kind === EVENT_KINDS.accessRequest).length;
  const subagentKeys = new Set<string>();
  let hasFailedSubagent = false;
  for (const e of group) {
    if (e.kind !== EVENT_KINDS.subagentRun && e.kind !== EVENT_KINDS.subagentOutput) continue;
    const payload = e.payload as {
      correlation_id?: string;
      subagent_id?: string;
      status?: string;
    };
    subagentKeys.add(payload.correlation_id ?? payload.subagent_id ?? e.filename);
    if (
      payload.status === failedSubagentStatuses.failed ||
      payload.status === failedSubagentStatuses.cancelled
    ) {
      hasFailedSubagent = true;
    }
  }
  return {
    type: feedItemTypes.group,
    participant_id: participant,
    items: group,
    status,
    toolCount,
    accessRequestCount,
    subagentCount: subagentKeys.size,
    hasFailedSubagent,
    timeRangeStart: first.timestamp,
    timeRangeEnd: last.timestamp,
  };
}

function shouldPlaceSelfCommentBeforePrevious(
  out: FeedItem[],
  group: AnyEventRecord[],
  participant: string,
): boolean {
  if (!group.every(isArbitraryProse)) return false;
  const previous = out[out.length - 1];
  if (previous?.type !== feedItemTypes.event) return false;
  if (previous.event.participant_id !== participant) return false;
  if (!isStandaloneResult(previous.event)) return false;
  return isNearAfter(previous.event.timestamp, group[0]!.timestamp);
}

export function projectFeed(events: FeedInput[]): FeedItem[] {
  const out: FeedItem[] = [];
  let buf: AnyEventRecord[] = [];
  let bufParticipant: string | null = null;

  const flush = (status: GroupStatus): void => {
    if (buf.length === 0 || bufParticipant === null) return;
    const group = finalize(buf, bufParticipant, status);
    if (shouldPlaceSelfCommentBeforePrevious(out, buf, bufParticipant)) {
      out.splice(out.length - 1, 0, group);
    } else {
      out.push(group);
    }
    buf = [];
    bufParticipant = null;
  };

  for (const ev of events) {
    if (isStubMarker(ev)) {
      // A consumed block would itself have been a flush point (a concluding
      // prose or a standalone result), so the stub in its slot closes the
      // buffered turn the same way — no group is split that wouldn't already
      // have been.
      flush(groupStatuses.concluded);
      out.push({ type: feedItemTypes.stub, stub: ev.stub });
      continue;
    }
    if (isMidTurn(ev)) {
      if (bufParticipant !== null && bufParticipant !== ev.participant_id) {
        // Another participant started a turn — the buffered turn is over, not
        // live. (Only the final unterminated group, flushed at end-of-events,
        // stays "streaming".) Marking it "ended" keeps historical turns
        // collapsed with a frozen timer instead of 47 fake "working" boxes.
        flush(groupStatuses.ended);
      }
      buf.push(ev);
      bufParticipant = ev.participant_id;
      continue;
    }
    // not mid-turn
    if (bufParticipant !== null && bufParticipant === ev.participant_id) {
      if (isConcluding(ev)) {
        flush(groupStatuses.concluded);
        out.push({ type: feedItemTypes.event, event: ev });
        continue;
      }
      if (ev.kind === EVENT_KINDS.turnEnd) {
        flush(groupStatuses.ended);
        out.push({ type: feedItemTypes.event, event: ev });
        continue;
      }
      // Standalone same-agent outputs (choices/html/flow/file/etc.) break the
      // current tool segment; resumed mid-turn work will open a fresh group.
      flush(groupStatuses.concluded);
      out.push({ type: feedItemTypes.event, event: ev });
      continue;
    } else if (bufParticipant !== null) {
      // A different participant's standalone event closed the buffered turn.
      flush(groupStatuses.ended);
    }
    out.push({ type: feedItemTypes.event, event: ev });
  }
  flush(groupStatuses.streaming);
  return out;
}
