import type {
  AnyEventRecord,
  ChoicesPayload,
  ProsePayload,
} from "@f-mark/shared";
import {
  getProseRole,
  getCommentTarget,
  getFileCommentTarget,
  getAppendTo,
  isNamedAnchor,
} from "@f-mark/shared";

function isProseTombstone(e: AnyEventRecord): boolean {
  if (e.kind !== "prose") return false;
  return (e.payload as ProsePayload).removed === true;
}

export interface Aggregated {
  events: AnyEventRecord[];
  visible: AnyEventRecord[];
  feed: AnyEventRecord[];
  feedDocument: AnyEventRecord[];
  feedConversation: AnyEventRecord[];
  named: AnyEventRecord[];
  commentsByTarget: Map<string, AnyEventRecord[]>;
  /** File/diff comments bucketed by `file_path::base::hunk` (when a hunk is
   *  attached) or `file_path::lines`. Parallel to commentsByTarget but keyed
   *  on a repo file path instead of an event anchor. */
  fileCommentsByPath: Map<string, AnyEventRecord[]>;
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

function isProseFileComment(e: AnyEventRecord): boolean {
  if (e.kind !== "prose") return false;
  return getProseRole(e.payload as ProsePayload).kind === "file-comment";
}

/** Grouping key for a file comment: pin to the hunk identity when present
 *  (so the same line in different diff modes stays distinct), else the line
 *  range, else the whole file. */
function fileCommentKey(ft: {
  file_path: string;
  lines?: [number, number];
  hunk?: string;
  base?: string;
}): string {
  if (ft.hunk !== undefined) {
    return `${ft.file_path}::${ft.base ?? "working"}::${ft.hunk}`;
  }
  return `${ft.file_path}::${ft.lines ? ft.lines.join("-") : "file"}`;
}

function isRemovedCommentMarker(e: AnyEventRecord): boolean {
  if (e.kind !== "prose") return false;
  const payload = e.payload as ProsePayload;
  return (
    payload.content.trim() === "_removed_" &&
    typeof payload.supersedes === "string"
  );
}

function isResolvedCommentMarker(e: AnyEventRecord): boolean {
  if (e.kind !== "prose") return false;
  const payload = e.payload as ProsePayload;
  return (
    payload.content.trim() === "_resolved_" &&
    typeof payload.supersedes === "string"
  );
}

function isCommentActivity(e: AnyEventRecord): boolean {
  return (
    (isProseComment(e) || isProseFileComment(e)) &&
    !isRemovedCommentMarker(e) &&
    !isResolvedCommentMarker(e)
  );
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

  /* Visual-alternatives: an html event whose filename is referenced by ANY
     choices option (a visual alternative's preview) is rendered inside its
     ChoicesCard, never as a standalone EmbedCard. Computed from ALL choices
     events — including superseded ones — so a superseded alternatives widget
     doesn't let its old option bundles reappear as standalone cards. The
     events stay in `agg.events` for ChoicesCard/search/source lookups. */
  const optionHtmlFilenames = new Set<string>();
  for (const e of sorted) {
    if (e.kind !== "choices") continue;
    for (const o of (e.payload as ChoicesPayload).options) {
      if (typeof o.html === "string" && o.html.length > 0) {
        optionHtmlFilenames.add(o.html);
      }
    }
  }

  /* Tombstone suppression — buddy_final finding "tombstones do not suppress
     a block chain". A prose event with `removed: true` that supersedes
     another event marks the WHOLE chain dead: hide the superseded target
     AND the tombstone itself. Repeat-removals on chains of tombstones are
     resolved by walking forward. */
  const tombstoned = new Set<string>();
  for (const e of sorted) {
    if (!isProseTombstone(e)) continue;
    const sup = (e.payload as { supersedes?: string }).supersedes;
    if (typeof sup === "string" && sup.length > 0) {
      tombstoned.add(sup);
    }
    tombstoned.add(e.filename);
  }

  /* Fork sibling disposition — buddy_final finding "fork siblings are not
     surfaced as forks/orphans". When multiple events supersede the same
     target, `resolveLiveAnchor` picks the lexicographically smallest
     filename as canonical. The losing siblings (and any blocks downstream
     of them) become forks — hidden from the feed but recorded so a future
     UI can surface them. */
  const forks = new Set<string>();
  for (const [, sibs] of supersedorOf) {
    if (sibs.length <= 1) continue;
    // The first (after sort) is canonical; the rest are forks.
    for (let i = 1; i < sibs.length; i++) forks.add(sibs[i]!);
  }

  const visible = sorted.filter(
    (e) =>
      !superseded.has(e.filename) &&
      !tombstoned.has(e.filename) &&
      !forks.has(e.filename),
  );
  const visibleByFilename = new Map<string, AnyEventRecord>();
  for (const e of visible) visibleByFilename.set(e.filename, e);

  /* Block grouping.
     For each visible block (has `append_to`, not a comment), resolve its
     parent's live filename via the supersedes chain. Only NAMED ANCHORS
     are valid parents — pointing `append_to` at an unnamed message or a
     standalone non-anchor yields an orphan (review_phase6 finding #1).
     This prevents top-level non-anchor cards from silently consuming
     blocks they don't know how to render. */
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
    const liveEvent =
      live === "cycle" ? undefined : visibleByFilename.get(live);
    if (liveEvent === undefined || !isNamedAnchor(liveEvent)) {
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

  /* Consumed blocks are rendered inside their anchor ProseCard, so they
     must not appear as top-level cards in any feed slice. Orphans (blocks
     pointing at a missing/cycled parent) stay visible at the top level. */
  const consumedFilenames = new Set<string>();
  for (const blocks of consumedBlocksByAnchor.values()) {
    for (const b of blocks) consumedFilenames.add(b.filename);
  }

  const feed = visible.filter(
    (e) =>
      (!isProseComment(e) || isCommentActivity(e)) &&
      e.kind !== "choice" &&
      !optionHtmlFilenames.has(e.filename) &&
      !consumedFilenames.has(e.filename),
  );
  const feedDocument = visible.filter(
    (e) =>
      (isNamedAnchor(e) || e.kind === "flow") &&
      !optionHtmlFilenames.has(e.filename) &&
      !consumedFilenames.has(e.filename),
  );
  const feedConversation = visible.filter((e) => {
    if (optionHtmlFilenames.has(e.filename)) return false;
    if (consumedFilenames.has(e.filename)) return false;
    if (e.kind === "prose") {
      const role = getProseRole(e.payload as ProsePayload);
      return role.kind === "message" || isCommentActivity(e);
    }
    return (
      e.kind === "file" ||
      e.kind === "choices" ||
      e.kind === "choice" ||
      e.kind === "subagent-run" ||
      e.kind === "subagent-output" ||
      e.kind === "turn-end" ||
      e.kind === "fork-link"
    );
  });
  const named = visible.filter(isNamedAnchor);

  const commentsByTarget = new Map<string, AnyEventRecord[]>();
  for (const e of visible) {
    if (e.kind !== "prose") continue;
    const ct = getCommentTarget(e.payload as ProsePayload);
    if (ct === undefined) continue;
    if (isRemovedCommentMarker(e)) continue;
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

  /* File/diff comments: bucket by repo path (+ hunk/lines). No supersedes
     chain walk — file comments anchor to a path, not an event. */
  const fileCommentsByPath = new Map<string, AnyEventRecord[]>();
  for (const e of visible) {
    if (e.kind !== "prose") continue;
    if (isRemovedCommentMarker(e)) continue;
    const ft = getFileCommentTarget(e.payload as ProsePayload);
    if (ft === undefined) continue;
    const key = fileCommentKey(ft);
    const arr = fileCommentsByPath.get(key) ?? [];
    arr.push(e);
    fileCommentsByPath.set(key, arr);
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
    fileCommentsByPath,
    consumedBlocksByAnchor,
    orphanBlocks,
    liveAnchorOf,
    rootOf,
    currentTurnParticipantPrefix,
  };
}
