import type {
  AnyEventRecord,
  ChoicesPayload,
  ProsePayload,
} from "@f-mark/shared";
import {
  EVENT_KINDS,
  getAppendTo,
  getCommentTarget,
  getFileCommentTarget,
  getProseRole,
  isNamedAnchor,
} from "@f-mark/shared";
import type { Aggregated, ConsumedStub } from "../aggregate.js";
import { currentTurnParticipantPrefix } from "../turnState.js";

const CHAIN_DEPTH_LIMIT = 64;

const proseRoleKinds = {
  comment: "comment",
  fileComment: "file-comment",
  message: "message",
  anchor: "anchor",
} as const;

const fileCommentDefaults = {
  base: "working",
  lineKey: "file",
} as const;

const liveAnchorSentinels = {
  cycle: "cycle",
} as const;

const commentMarkers = {
  removed: "_removed_",
  resolved: "_resolved_",
} as const;

function isProseTombstone(event: AnyEventRecord): boolean {
  if (event.kind !== EVENT_KINDS.prose) return false;
  return (event.payload as ProsePayload).removed === true;
}

function isProseComment(event: AnyEventRecord): boolean {
  if (event.kind !== EVENT_KINDS.prose) return false;
  return (
    getProseRole(event.payload as ProsePayload).kind === proseRoleKinds.comment
  );
}

function isProseFileComment(event: AnyEventRecord): boolean {
  if (event.kind !== EVENT_KINDS.prose) return false;
  return (
    getProseRole(event.payload as ProsePayload).kind ===
    proseRoleKinds.fileComment
  );
}

function fileCommentKey(target: {
  file_path: string;
  lines?: [number, number];
  hunk?: string;
  base?: string;
}): string {
  if (target.hunk !== undefined) {
    return `${target.file_path}::${target.base ?? fileCommentDefaults.base}::${target.hunk}`;
  }
  return `${target.file_path}::${target.lines ? target.lines.join("-") : fileCommentDefaults.lineKey}`;
}

function isRemovedCommentMarker(event: AnyEventRecord): boolean {
  if (event.kind !== EVENT_KINDS.prose) return false;
  const payload = event.payload as ProsePayload;
  return (
    payload.content.trim() === commentMarkers.removed &&
    typeof payload.supersedes === "string"
  );
}

function isResolvedCommentMarker(event: AnyEventRecord): boolean {
  if (event.kind !== EVENT_KINDS.prose) return false;
  const payload = event.payload as ProsePayload;
  return (
    payload.content.trim() === commentMarkers.resolved &&
    typeof payload.supersedes === "string"
  );
}

function isCommentActivity(event: AnyEventRecord): boolean {
  return (
    (isProseComment(event) || isProseFileComment(event)) &&
    !isRemovedCommentMarker(event) &&
    !isResolvedCommentMarker(event)
  );
}

/* Filenames this event supersedes. Scalar for a revision/comment marker; an
   array when one coalesced assistant message hides its streamed delta files.
   The array is written in run order, so element 0 is the chain root. */
function supersedesFilenames(event: AnyEventRecord): string[] {
  const supersedes = (event.payload as { supersedes?: string | string[] })
    .supersedes;
  if (typeof supersedes === "string") {
    return supersedes.length > 0 ? [supersedes] : [];
  }
  if (Array.isArray(supersedes)) {
    return supersedes.filter(
      (item): item is string => typeof item === "string" && item.length > 0,
    );
  }
  return [];
}

export class EventAggregator {
  private readonly sorted: AnyEventRecord[];
  private readonly supersedorOf: Map<string, string[]>;
  private readonly superseded: Set<string>;
  private readonly liveAnchorOf = new Map<string, string | "cycle">();
  private readonly rootOf: Map<string, string>;
  private visible: AnyEventRecord[] = [];
  private visibleByFilename = new Map<string, AnyEventRecord>();
  private consumedBlocksByAnchor = new Map<string, AnyEventRecord[]>();
  private orphanBlocks = new Set<string>();
  private anchorOfConsumedBlock = new Map<string, string>();

  constructor(events: AnyEventRecord[]) {
    this.sorted = [...events].sort((a, b) => {
      const timestampOrder = a.timestamp.localeCompare(b.timestamp);
      return timestampOrder !== 0
        ? timestampOrder
        : a.filename.localeCompare(b.filename);
    });
    this.supersedorOf = this.buildSupersedorOf();
    this.superseded = new Set<string>(this.supersedorOf.keys());
    this.rootOf = this.buildRootOf();
  }

  aggregate(): Aggregated {
    const optionHtmlFilenames = this.collectChoiceOptionHtmlFilenames();
    const tombstoned = this.collectTombstonedChainFilenames();
    const forks = this.collectForkSiblingFilenames();
    this.visible = this.buildVisibleEvents(tombstoned, forks);
    this.visibleByFilename = this.indexByFilename(this.visible);
    this.groupConsumedBlocks();

    const consumedFilenames = this.collectConsumedFilenames();
    const { stubs, anchorAdjacentReadKey } = this.computeConsumedStubs(
      consumedFilenames,
      optionHtmlFilenames,
    );
    return {
      events: this.sorted,
      visible: this.visible,
      feed: this.buildFeed(optionHtmlFilenames, consumedFilenames),
      feedDocument: this.buildDocumentFeed(optionHtmlFilenames, consumedFilenames),
      feedConversation: this.buildConversationFeed(
        optionHtmlFilenames,
        consumedFilenames,
      ),
      named: this.visible.filter(isNamedAnchor),
      commentsByTarget: this.buildCommentsByTarget(),
      fileCommentsByPath: this.buildFileCommentsByPath(),
      consumedBlocksByAnchor: this.consumedBlocksByAnchor,
      orphanBlocks: this.orphanBlocks,
      liveAnchorOf: this.liveAnchorOf,
      rootOf: this.rootOf,
      consumedStubs: stubs,
      anchorAdjacentReadKey,
      currentTurnParticipantPrefix: currentTurnParticipantPrefix(this.sorted),
    };
  }

  private buildSupersedorOf(): Map<string, string[]> {
    const supersedorOf = new Map<string, string[]>();
    for (const event of this.sorted) {
      for (const supersedes of supersedesFilenames(event)) {
        const list = supersedorOf.get(supersedes) ?? [];
        list.push(event.filename);
        supersedorOf.set(supersedes, list);
      }
    }
    for (const list of supersedorOf.values()) list.sort();
    return supersedorOf;
  }

  private buildRootOf(): Map<string, string> {
    const supersedesOf = new Map<string, string>();
    for (const event of this.sorted) {
      // Element 0 (run order) is the chain root used for slot stability.
      const [root] = supersedesFilenames(event);
      if (root !== undefined) supersedesOf.set(event.filename, root);
    }

    const rootOf = new Map<string, string>();
    for (const event of this.sorted) {
      rootOf.set(event.filename, this.resolveRoot(event.filename, supersedesOf));
    }
    return rootOf;
  }

  private resolveRoot(
    filename: string,
    supersedesOf: Map<string, string>,
  ): string {
    const seen = new Set<string>();
    let current = filename;
    for (let i = 0; i < CHAIN_DEPTH_LIMIT; i++) {
      const previous = supersedesOf.get(current);
      if (previous === undefined || seen.has(current)) break;
      seen.add(current);
      current = previous;
    }
    return current;
  }

  private collectChoiceOptionHtmlFilenames(): Set<string> {
    const filenames = new Set<string>();
    for (const event of this.sorted) {
      if (event.kind !== EVENT_KINDS.choices) continue;
      for (const option of (event.payload as ChoicesPayload).options) {
        if (typeof option.html === "string" && option.html.length > 0) {
          filenames.add(option.html);
        }
      }
    }
    return filenames;
  }

  private collectTombstonedChainFilenames(): Set<string> {
    const tombstoned = new Set<string>();
    for (const event of this.sorted) {
      if (!isProseTombstone(event)) continue;
      for (const supersedes of supersedesFilenames(event)) tombstoned.add(supersedes);
      tombstoned.add(event.filename);
    }
    return tombstoned;
  }

  private collectForkSiblingFilenames(): Set<string> {
    const forks = new Set<string>();
    for (const siblings of this.supersedorOf.values()) {
      for (let i = 1; i < siblings.length; i++) {
        forks.add(siblings[i]!);
      }
    }
    return forks;
  }

  private buildVisibleEvents(
    tombstoned: Set<string>,
    forks: Set<string>,
  ): AnyEventRecord[] {
    return this.sorted.filter(
      (event) =>
        !this.superseded.has(event.filename) &&
        !tombstoned.has(event.filename) &&
        !forks.has(event.filename),
    );
  }

  private indexByFilename(
    events: AnyEventRecord[],
  ): Map<string, AnyEventRecord> {
    const byFilename = new Map<string, AnyEventRecord>();
    for (const event of events) byFilename.set(event.filename, event);
    return byFilename;
  }

  private groupConsumedBlocks(): void {
    const consumedBlocksByAnchor = new Map<string, AnyEventRecord[]>();
    const orphanBlocks = new Set<string>();

    for (const event of this.visible) {
      const appendTo = getAppendTo(event);
      if (appendTo === undefined || appendTo.length === 0) continue;
      if (isProseComment(event)) continue;

      const liveAnchor = this.resolveCachedLiveAnchor(appendTo);
      const liveEvent =
        liveAnchor === liveAnchorSentinels.cycle
          ? undefined
          : this.visibleByFilename.get(liveAnchor);
      if (liveEvent === undefined || !isNamedAnchor(liveEvent)) {
        orphanBlocks.add(event.filename);
        continue;
      }

      const blocks = consumedBlocksByAnchor.get(liveAnchor) ?? [];
      blocks.push(event);
      consumedBlocksByAnchor.set(liveAnchor, blocks);
      this.anchorOfConsumedBlock.set(event.filename, liveAnchor);
    }

    this.sortConsumedBlocks(consumedBlocksByAnchor);
    this.consumedBlocksByAnchor = consumedBlocksByAnchor;
    this.orphanBlocks = orphanBlocks;
  }

  /* Walk the sorted visible stream to place a "stub" wherever a run of
     consecutive consumed blocks landed on the same anchor. A run whose
     immediately-preceding FEED row is its own anchor is same-turn doc
     building — no stub (the blocks render right under the anchor); instead
     the anchor's read key advances to the newest such block so its relit
     dot can clear. Every other run becomes a jump-to-anchor stub. `newest`
     is computed as max(filename), never the rootOf-sorted last block. */
  private computeConsumedStubs(
    consumedFilenames: Set<string>,
    optionHtmlFilenames: Set<string>,
  ): { stubs: ConsumedStub[]; anchorAdjacentReadKey: Map<string, string> } {
    const stubs: ConsumedStub[] = [];
    const anchorAdjacentReadKey = new Map<string, string>();
    let lastFeedFilename: string | null = null;
    let runAnchor: string | null = null;
    let runPreceding: string | null = null;
    let runNewest = "";
    let runCount = 0;

    const closeRun = (): void => {
      if (runAnchor !== null && runCount > 0) {
        if (runPreceding === runAnchor) {
          const prev = anchorAdjacentReadKey.get(runAnchor);
          if (prev === undefined || runNewest > prev) {
            anchorAdjacentReadKey.set(runAnchor, runNewest);
          }
        } else {
          stubs.push({
            anchorFilename: runAnchor,
            docName: this.anchorDocName(runAnchor),
            newestBlockFilename: runNewest,
            blockCount: runCount,
          });
        }
      }
      runAnchor = null;
      runPreceding = null;
      runNewest = "";
      runCount = 0;
    };

    for (const event of this.visible) {
      const anchorFilename = this.anchorOfConsumedBlock.get(event.filename);
      if (anchorFilename !== undefined) {
        if (runAnchor !== null && runAnchor !== anchorFilename) closeRun();
        if (runAnchor === null) {
          runAnchor = anchorFilename;
          runPreceding = lastFeedFilename;
        }
        if (event.filename > runNewest) runNewest = event.filename;
        runCount += 1;
        continue;
      }
      closeRun();
      if (this.isFeedRowEvent(event, consumedFilenames, optionHtmlFilenames)) {
        lastFeedFilename = event.filename;
      }
    }
    closeRun();
    return { stubs, anchorAdjacentReadKey };
  }

  private anchorDocName(anchorFilename: string): string {
    const anchorEvent = this.visibleByFilename.get(anchorFilename);
    if (anchorEvent === undefined || anchorEvent.kind !== EVENT_KINDS.prose) {
      return "";
    }
    const role = getProseRole(anchorEvent.payload as ProsePayload);
    return role.kind === proseRoleKinds.anchor ? role.name : "";
  }

  /* Mirror of buildFeed's membership test: is this event a top-level feed
     row (the reference point for stub adjacency)? Consumed blocks are handled
     by the caller before this runs, so they never reach here. */
  private isFeedRowEvent(
    event: AnyEventRecord,
    consumedFilenames: Set<string>,
    optionHtmlFilenames: Set<string>,
  ): boolean {
    return (
      (!isProseComment(event) || isCommentActivity(event)) &&
      event.kind !== EVENT_KINDS.choice &&
      !optionHtmlFilenames.has(event.filename) &&
      !consumedFilenames.has(event.filename)
    );
  }

  private resolveCachedLiveAnchor(anchor: string): string | "cycle" {
    const cached = this.liveAnchorOf.get(anchor);
    if (cached !== undefined) return cached;
    const liveAnchor = this.resolveLiveAnchor(anchor);
    this.liveAnchorOf.set(anchor, liveAnchor);
    return liveAnchor;
  }

  private resolveLiveAnchor(start: string): string | "cycle" {
    const seen = new Set<string>();
    let current = start;
    for (let i = 0; i < CHAIN_DEPTH_LIMIT; i++) {
      const next = this.supersedorOf.get(current);
      if (next === undefined || next.length === 0) return current;
      if (seen.has(current)) return liveAnchorSentinels.cycle;
      seen.add(current);
      current = next[0]!;
    }
    return liveAnchorSentinels.cycle;
  }

  private sortConsumedBlocks(
    consumedBlocksByAnchor: Map<string, AnyEventRecord[]>,
  ): void {
    for (const blocks of consumedBlocksByAnchor.values()) {
      blocks.sort((a, b) => {
        const aRoot = this.rootOf.get(a.filename) ?? a.filename;
        const bRoot = this.rootOf.get(b.filename) ?? b.filename;
        return aRoot.localeCompare(bRoot);
      });
    }
  }

  private collectConsumedFilenames(): Set<string> {
    const filenames = new Set<string>();
    for (const blocks of this.consumedBlocksByAnchor.values()) {
      for (const block of blocks) filenames.add(block.filename);
    }
    return filenames;
  }

  private buildFeed(
    optionHtmlFilenames: Set<string>,
    consumedFilenames: Set<string>,
  ): AnyEventRecord[] {
    return this.visible.filter(
      (event) =>
        (!isProseComment(event) || isCommentActivity(event)) &&
        event.kind !== EVENT_KINDS.choice &&
        !optionHtmlFilenames.has(event.filename) &&
        !consumedFilenames.has(event.filename),
    );
  }

  private buildDocumentFeed(
    optionHtmlFilenames: Set<string>,
    consumedFilenames: Set<string>,
  ): AnyEventRecord[] {
    return this.visible.filter(
      (event) =>
        (isNamedAnchor(event) || event.kind === EVENT_KINDS.flow) &&
        !optionHtmlFilenames.has(event.filename) &&
        !consumedFilenames.has(event.filename),
    );
  }

  private buildConversationFeed(
    optionHtmlFilenames: Set<string>,
    consumedFilenames: Set<string>,
  ): AnyEventRecord[] {
    return this.visible.filter((event) =>
      this.isConversationFeedEvent(
        event,
        optionHtmlFilenames,
        consumedFilenames,
      ),
    );
  }

  private isConversationFeedEvent(
    event: AnyEventRecord,
    optionHtmlFilenames: Set<string>,
    consumedFilenames: Set<string>,
  ): boolean {
    if (optionHtmlFilenames.has(event.filename)) return false;
    if (consumedFilenames.has(event.filename)) return false;
    if (event.kind === EVENT_KINDS.prose) {
      const role = getProseRole(event.payload as ProsePayload);
      return role.kind === proseRoleKinds.message || isCommentActivity(event);
    }
    return (
      event.kind === EVENT_KINDS.file ||
      event.kind === EVENT_KINDS.choices ||
      event.kind === EVENT_KINDS.choice ||
      event.kind === EVENT_KINDS.subagentRun ||
      event.kind === EVENT_KINDS.subagentOutput ||
      event.kind === EVENT_KINDS.turnEnd ||
      event.kind === EVENT_KINDS.forkLink
    );
  }

  private buildCommentsByTarget(): Map<string, AnyEventRecord[]> {
    const commentsByTarget = new Map<string, AnyEventRecord[]>();
    for (const event of this.visible) {
      if (event.kind !== EVENT_KINDS.prose) continue;
      const target = getCommentTarget(event.payload as ProsePayload);
      if (target === undefined || isRemovedCommentMarker(event)) continue;

      const liveTarget = this.resolveCachedLiveAnchor(target.anchor);
      const key =
        liveTarget === liveAnchorSentinels.cycle ? target.anchor : liveTarget;
      const comments = commentsByTarget.get(key) ?? [];
      comments.push(event);
      commentsByTarget.set(key, comments);
    }
    return commentsByTarget;
  }

  private buildFileCommentsByPath(): Map<string, AnyEventRecord[]> {
    const fileCommentsByPath = new Map<string, AnyEventRecord[]>();
    for (const event of this.visible) {
      if (
        event.kind !== EVENT_KINDS.prose ||
        isRemovedCommentMarker(event)
      ) {
        continue;
      }
      const target = getFileCommentTarget(event.payload as ProsePayload);
      if (target === undefined) continue;

      const key = fileCommentKey(target);
      const comments = fileCommentsByPath.get(key) ?? [];
      comments.push(event);
      fileCommentsByPath.set(key, comments);
    }
    return fileCommentsByPath;
  }
}
