import type { AnyEventRecord, ProsePayload } from "@f-mark/shared";

export interface Aggregated {
  events: AnyEventRecord[];
  visible: AnyEventRecord[];
  feed: AnyEventRecord[];
  feedDocument: AnyEventRecord[];
  feedConversation: AnyEventRecord[];
  named: AnyEventRecord[];
  commentsByTarget: Map<string, AnyEventRecord[]>;
  currentTurnParticipantPrefix: "us" | "ag";
}

function isProse(e: AnyEventRecord): boolean {
  return e.kind === "prose";
}

function proseHasTarget(e: AnyEventRecord): boolean {
  return isProse(e) && (e.payload as ProsePayload).target !== undefined;
}

function proseHasName(e: AnyEventRecord): boolean {
  return isProse(e) && (e.payload as ProsePayload).name !== undefined;
}

function nextTurnPrefix(participantId: string): "us" | "ag" {
  return participantId.startsWith("ag-") ? "us" : "ag";
}

export function aggregate(events: AnyEventRecord[]): Aggregated {
  const sorted = [...events].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );
  const superseded = new Set<string>();
  for (const e of sorted) {
    const sup = (e.payload as { supersedes?: string }).supersedes;
    if (typeof sup === "string") superseded.add(sup);
  }
  const visible = sorted.filter((e) => !superseded.has(e.filename));
  const feed = visible.filter(
    (e) => !proseHasTarget(e) && e.kind !== "choice",
  );
  /* Document view: named prose contributions only.
     Comments are dropped here — they appear as pins on the named cards.
     Turn-end dividers are dropped — they're conversational structure, not
     document content. */
  const feedDocument = visible.filter(
    (e) => e.kind === "prose" && proseHasName(e) && !proseHasTarget(e),
  );
  /* Conversation view: unnamed messages + choices (+ choice records) + turn
     dividers. Comments and named contributions are dropped. */
  const feedConversation = visible.filter(
    (e) =>
      (e.kind === "prose" && !proseHasName(e) && !proseHasTarget(e)) ||
      e.kind === "choices" ||
      e.kind === "choice" ||
      e.kind === "turn-end",
  );
  const named = visible.filter(proseHasName);
  const commentsByTarget = new Map<string, AnyEventRecord[]>();
  for (const e of visible) {
    if (!proseHasTarget(e)) continue;
    const target = (e.payload as ProsePayload).target!.file;
    const arr = commentsByTarget.get(target) ?? [];
    arr.push(e);
    commentsByTarget.set(target, arr);
  }
  let currentTurnParticipantPrefix: "us" | "ag" = "us";
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i]!.kind === "turn-end") {
      currentTurnParticipantPrefix = nextTurnPrefix(sorted[i]!.participant_id);
      break;
    }
  }
  return {
    events: sorted,
    visible,
    feed,
    feedDocument,
    feedConversation,
    named,
    commentsByTarget,
    currentTurnParticipantPrefix,
  };
}
