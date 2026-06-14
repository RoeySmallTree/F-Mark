import type { AnyEventRecord } from "@f-mark/shared";

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
}

export type FeedItem = ArbitraryGroup | SingleEventItem;

function isMidTurn(ev: AnyEventRecord): boolean {
  if (ev.kind === "tool-use") return true;
  if (ev.kind === "access-request") return true;
  if (ev.kind === "subagent-run" || ev.kind === "subagent-output") return true;
  if (ev.kind === "prose") {
    const p = ev.payload as { arbitrary?: boolean };
    return p.arbitrary === true;
  }
  return false;
}

function isConcluding(ev: AnyEventRecord): boolean {
  if (ev.kind !== "prose") return false;
  const p = ev.payload as { arbitrary?: boolean };
  return p.arbitrary !== true;
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
  const toolCount = group.filter((e) => e.kind === "tool-use").length;
  const accessRequestCount = group.filter((e) => e.kind === "access-request").length;
  const subagentKeys = new Set<string>();
  let hasFailedSubagent = false;
  for (const e of group) {
    if (e.kind !== "subagent-run" && e.kind !== "subagent-output") continue;
    const payload = e.payload as {
      correlation_id?: string;
      subagent_id?: string;
      status?: string;
    };
    subagentKeys.add(payload.correlation_id ?? payload.subagent_id ?? e.filename);
    if (payload.status === "failed" || payload.status === "cancelled") {
      hasFailedSubagent = true;
    }
  }
  return {
    type: "group",
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

export function projectFeed(events: AnyEventRecord[]): FeedItem[] {
  const out: FeedItem[] = [];
  let buf: AnyEventRecord[] = [];
  let bufParticipant: string | null = null;

  const flush = (status: GroupStatus): void => {
    if (buf.length === 0 || bufParticipant === null) return;
    out.push(finalize(buf, bufParticipant, status));
    buf = [];
    bufParticipant = null;
  };

  for (const ev of events) {
    if (isMidTurn(ev)) {
      if (bufParticipant !== null && bufParticipant !== ev.participant_id) {
        flush("streaming");
      }
      buf.push(ev);
      bufParticipant = ev.participant_id;
      continue;
    }
    // not mid-turn
    if (bufParticipant !== null && bufParticipant === ev.participant_id) {
      if (isConcluding(ev)) {
        flush("concluded");
        out.push({ type: "event", event: ev });
        continue;
      }
      if (ev.kind === "turn-end") {
        flush("ended");
        // turn-end itself is dropped when it concludes a group, to avoid
        // double-rendering inside the group box plus a standalone divider.
        continue;
      }
    } else if (bufParticipant !== null) {
      flush("streaming");
    }
    out.push({ type: "event", event: ev });
  }
  flush("streaming");
  return out;
}
