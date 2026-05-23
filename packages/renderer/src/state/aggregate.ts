import type { AnyEventRecord, ProsePayload } from "@f-mark/shared";
import {
  getProseRole,
  getCommentTarget,
  getAppendTo,
  isNamedAnchor,
} from "@f-mark/shared";

export interface Aggregated {
  events: AnyEventRecord[];
  visible: AnyEventRecord[];
  feed: AnyEventRecord[];
  feedDocument: AnyEventRecord[];
  feedConversation: AnyEventRecord[];
  named: AnyEventRecord[];
  commentsByTarget: Map<string, AnyEventRecord[]>;
  /** Blocks whose resolved (live) parent is a visible composable parent.
   *  Sorted by the ROOT block's timestamp+filename so an edit-in-place
   *  preserves slot. Phase 6 will filter these out of `feed`. */
  consumedBlocksByAnchor: Map<string, AnyEventRecord[]>;
  /** Block filenames whose `append_to` points at a missing or
   *  cycle-detected parent. Renderer surfaces these as top-level cards
   *  with an "orphaned embed" badge. */
  orphanBlocks: Set<string>;
  /** For any superseded anchor filename, the live filename at the end
   *  of its supersedes chain (deterministic — lexicographically smallest
   *  supersedor wins on forks). "cycle" if a cycle was detected. */
  liveAnchorOf: Map<string, string | "cycle">;
  /** For any revision filename, the root filename of its supersedes
   *  chain. Used to sort blocks by their original slot. */
  rootOf: Map<string, string>;
  currentTurnParticipantPrefix: "us" | "ag";
}

function isProseComment(e: AnyEventRecord): boolean {
  if (e.kind !== "prose") return false;
  return getProseRole(e.payload as ProsePayload).kind === "comment";
}

function nextTurnPrefix(participantId: string): "us" | "ag" {
  return participantId.startsWith("ag-") ? "us" : "ag";
}

const CHAIN_DEPTH_LIMIT = 64;

/* `supersedorOf` records every event that supersedes a given filename.
   Forks (multiple supersedors of the same target) are resolved by
   sorting the supersedor filenames lexicographically and picking the
   smallest. Other branches surface as orphans. */
function buildSupersedorOf(
  sorted: AnyEventRecord[],
): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const e of sorted) {
    const sup = (e.payload as { supersedes?: string }).supersedes;
    if (typeof sup !== "string" || sup.length === 0) continue;
    const list = m.get(sup) ?? [];
    list.push(e.filename);
    m.set(sup, list);
  }
  for (const list of m.values()) list.sort();
  return m;
}

/* Walks `supersedorOf` forward to find the live revision. Returns
   "cycle" on visited-set repeat. */
function resolveLiveAnchor(
  start: string,
  supersedorOf: Map<string, string[]>,
): string | "cycle" {
  const seen = new Set<string>();
  let cur = start;
  for (let i = 0; i < CHAIN_DEPTH_LIMIT; i++) {
    const next = supersedorOf.get(cur);
    if (next === undefined || next.length === 0) return cur;
    if (seen.has(cur)) return "cycle";
    seen.add(cur);
    cur = next[0]!;
  }
  return "cycle";
}

/* Walks each event's `supersedes` pointer backward to the chain's root.
   Used to sort blocks by original-slot timestamp so an edit-in-place
   doesn't jump position. Cycles return the visited entry-point. */
function buildRootOf(sorted: AnyEventRecord[]): Map<string, string> {
  const supersedesOf = new Map<string, string>();
  for (const e of sorted) {
    const sup = (e.payload as { supersedes?: string }).supersedes;
    if (typeof sup === "string" && sup.length > 0) {
      supersedesOf.set(e.filename, sup);
    }
  }
  const root = new Map<string, string>();
  for (const e of sorted) {
    const seen = new Set<string>();
    let cur = e.filename;
    for (let i = 0; i < CHAIN_DEPTH_LIMIT; i++) {
      const prev = supersedesOf.get(cur);
      if (prev === undefined) break;
      if (seen.has(cur)) break; // cycle guard
      seen.add(cur);
      cur = prev;
    }
    root.set(e.filename, cur);
  }
  return root;
}

export function aggregate(events: AnyEventRecord[]): Aggregated {
  const sorted = [...events].sort((a, b) => {
    const t = a.timestamp.localeCompare(b.timestamp);
    return t !== 0 ? t : a.filename.localeCompare(b.filename);
  });
  const supersedorOf = buildSupersedorOf(sorted);
  const superseded = new Set<string>(supersedorOf.keys());
  const visible = sorted.filter((e) => !superseded.has(e.filename));
  const visibleByFilename = new Set(visible.map((e) => e.filename));

  /* Block grouping.
     For each visible block (has `append_to`, not a comment), resolve its
     parent's live filename via the supersedes chain. If the live parent
     isn't visible, the block is an orphan. */
  const consumedBlocksByAnchor = new Map<string, AnyEventRecord[]>();
  const orphanBlocks = new Set<string>();
  const liveAnchorOf = new Map<string, string | "cycle">();
  const rootOf = buildRootOf(sorted);

  for (const e of visible) {
    const appendTo = getAppendTo(e);
    if (appendTo === undefined || appendTo.length === 0) continue;
    if (isProseComment(e)) continue; // comments stay on commentsByTarget path

    let live = liveAnchorOf.get(appendTo);
    if (live === undefined) {
      live = resolveLiveAnchor(appendTo, supersedorOf);
      liveAnchorOf.set(appendTo, live);
    }
    if (live === "cycle" || !visibleByFilename.has(live)) {
      orphanBlocks.add(e.filename);
      continue;
    }
    const list = consumedBlocksByAnchor.get(live) ?? [];
    list.push(e);
    consumedBlocksByAnchor.set(live, list);
  }

  // Sort each anchor's blocks by their ROOT block's timestamp+filename
  // so a supersedor stays in the original slot.
  for (const [, blocks] of consumedBlocksByAnchor) {
    blocks.sort((a, b) => {
      const aRoot = rootOf.get(a.filename) ?? a.filename;
      const bRoot = rootOf.get(b.filename) ?? b.filename;
      return aRoot.localeCompare(bRoot);
    });
  }

  // Phase 5 deliberately does NOT filter consumed blocks from feed slices.
  // Phase 6 wires that on, together with the ProseCard composition and
  // ProseInlineBlock registry — so blocks never "vanish" between phases.
  const feed = visible.filter(
    (e) => !isProseComment(e) && e.kind !== "choice",
  );
  const feedDocument = visible.filter(
    (e) => isNamedAnchor(e) || e.kind === "flow",
  );
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
    /* Comments that target a superseded parent re-bind to the live
       parent — same chain walk as block re-binding. */
    let liveTarget = liveAnchorOf.get(ct.anchor);
    if (liveTarget === undefined) {
      liveTarget = resolveLiveAnchor(ct.anchor, supersedorOf);
      liveAnchorOf.set(ct.anchor, liveTarget);
    }
    const key = liveTarget === "cycle" ? ct.anchor : liveTarget;
    const arr = commentsByTarget.get(key) ?? [];
    arr.push(e);
    commentsByTarget.set(key, arr);
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
    consumedBlocksByAnchor,
    orphanBlocks,
    liveAnchorOf,
    rootOf,
    currentTurnParticipantPrefix,
  };
}
