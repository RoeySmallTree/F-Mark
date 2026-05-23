import type { AnyEventRecord, ProsePayload } from "@f-mark/shared";
import { getProseRole, getCommentTarget, isNamedAnchor } from "@f-mark/shared";

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

function isProseComment(e: AnyEventRecord): boolean {
  if (e.kind !== "prose") return false;
  return getProseRole(e.payload as ProsePayload).kind === "comment";
}

function nextTurnPrefix(participantId: string): "us" | "ag" {
  return participantId.startsWith("ag-") ? "us" : "ag";
}

export function aggregate(events: AnyEventRecord[]): Aggregated {
  const sorted = [...events].sort((a, b) => {
    const t = a.timestamp.localeCompare(b.timestamp);
    return t !== 0 ? t : a.filename.localeCompare(b.filename);
  });
  const superseded = new Set<string>();
  for (const e of sorted) {
    const sup = (e.payload as { supersedes?: string }).supersedes;
    if (typeof sup === "string") superseded.add(sup);
  }
  const visible = sorted.filter((e) => !superseded.has(e.filename));
  const feed = visible.filter(
    (e) => !isProseComment(e) && e.kind !== "choice",
  );
  /* Document view: anchor prose + flow charts (durable deliberate contributions).
     Comments are dropped here — they appear as pins on the named cards.
     Turn-end dividers are dropped — they're conversational structure, not
     document content. Anchor prose = named prose without an `append_to`. */
  const feedDocument = visible.filter(
    (e) => isNamedAnchor(e) || e.kind === "flow",
  );
  /* Conversation view: unnamed messages + choices (+ choice records) + turn
     dividers. Comments and anchor/named contributions are dropped. */
  const feedConversation = visible.filter((e) => {
    if (e.kind === "prose") {
      return getProseRole(e.payload as ProsePayload).kind === "message";
    }
    return (
      e.kind === "file" ||
      e.kind === "choices" ||
      e.kind === "choice" ||
      e.kind === "turn-end"
    );
  });
  const named = visible.filter(isNamedAnchor);
  const commentsByTarget = new Map<string, AnyEventRecord[]>();
  for (const e of visible) {
    if (e.kind !== "prose") continue;
    const ct = getCommentTarget(e.payload as ProsePayload);
    if (ct === undefined) continue;
    const arr = commentsByTarget.get(ct.anchor) ?? [];
    arr.push(e);
    commentsByTarget.set(ct.anchor, arr);
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
