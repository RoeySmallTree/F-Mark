import type { AnyEventRecord } from "@f-mark/shared";

export type GroupStatus = "streaming" | "concluded" | "ended";

export interface ArbitraryGroup {
  type: "group";
  participant_id: string;
  items: AnyEventRecord[];
  status: GroupStatus;
  toolCount: number;
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
  return {
    type: "group",
    participant_id: participant,
    items: group,
    status,
    toolCount,
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
