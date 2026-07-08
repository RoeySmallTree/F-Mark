import type {
  AnyEventRecord,
  DiffBase,
  LineContext,
  ProsePayload,
} from "@f-mark/shared";
import { getCommentTarget, getFileCommentTarget } from "@f-mark/shared";
import { extractFileQuote, quoteFromEventTarget } from "../../../comments/commentQuote.js";
import {
  createChainRootResolver,
  isMarkerEvent,
  isRemovedMarker,
  resolvedChainRootsFromComments,
  supersedesOf,
} from "../../../comments/commentMarkers.js";

const NO_LOOSE_STRING_VALUES = {
  all: "all",
  working: "working",
  prose: "prose",
  removed: "_removed_",
} as const;

export type LineRange = [number, number];

export interface CommentNode {
  event: AnyEventRecord;
  replies: AnyEventRecord[];
  resolved: boolean;
}

export interface CommentGroup {
  key: string;
  targetFile: string;
  lines?: LineRange;
  target?: AnyEventRecord;
  title: string;
  quote: string | null;
  roots: CommentNode[];
  anchorOrder: string;
  /** Set for file/diff comment groups. `targetFile` then holds the file path. */
  filePath?: string;
  hunk?: string;
  base?: DiffBase;
  /** Fuzzy re-anchor context for line-drift repair on reveal. */
  lineContext?: LineContext;
}

interface EventCommentBucket {
  targetFile: string;
  lines?: LineRange;
  comments: AnyEventRecord[];
}

interface FileCommentBucket {
  filePath: string;
  lines?: LineRange;
  hunk?: string;
  base?: DiffBase;
  lineContext?: LineContext;
  comments: AnyEventRecord[];
}

export const COMMENT_EMOJIS = ["👍", "❤️", "👀", "✅"];

export function lineKey(lines: LineRange | undefined): string {
  return lines === undefined ? NO_LOOSE_STRING_VALUES.all : `${lines[0]}:${lines[1]}`;
}

export function targetKey(file: string, lines: LineRange | undefined): string {
  return `${file}::${lineKey(lines)}`;
}

/* Canonical key for a file/diff comment group. Hunk comments pin to
   `file_path::base::hunk` so the same line in different diff modes stays a
   distinct thread. */
export function fileTargetKey(
  filePath: string,
  opts: { lines?: LineRange; hunk?: string; base?: DiffBase },
): string {
  return opts.hunk !== undefined
    ? `${filePath}::${opts.base ?? NO_LOOSE_STRING_VALUES.working}::${opts.hunk}`
    : `${filePath}::${lineKey(opts.lines)}`;
}

export function lineLabel(lines: LineRange | undefined): string {
  if (lines === undefined) return "whole item";
  return lines[0] === lines[1]
    ? `line ${lines[0]}`
    : `lines ${lines[0]}-${lines[1]}`;
}

export function contentOf(event: AnyEventRecord): string {
  return (event.payload as ProsePayload).content ?? "";
}

export function inReplyToOf(event: AnyEventRecord): string | undefined {
  const inReplyTo = (event.payload as ProsePayload).in_reply_to;
  return typeof inReplyTo === "string" && inReplyTo.length > 0
    ? inReplyTo
    : undefined;
}

export function shortPreview(text: string, max = 130): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function buildCommentGroups(events: AnyEventRecord[]): CommentGroup[] {
  const targets = new Map(events.map((event) => [event.filename, event]));
  const groups = [
    ...buildEventCommentGroups(events, targets),
    ...buildFileCommentGroups(events),
  ];
  return groups.sort((a, b) => a.anchorOrder.localeCompare(b.anchorOrder));
}

function buildEventCommentGroups(
  events: AnyEventRecord[],
  targets: Map<string, AnyEventRecord>,
): CommentGroup[] {
  const buckets = collectEventBuckets(events);
  return [...buckets.entries()].flatMap(([key, bucket]) => {
    const roots = buildThreads(bucket.comments);
    if (roots.length === 0) return [];
    const target = targets.get(bucket.targetFile);
    return [
      {
        key,
        targetFile: bucket.targetFile,
        ...(bucket.lines === undefined ? {} : { lines: bucket.lines }),
        target,
        title: deriveTargetTitle(target, bucket.targetFile),
        quote: extractQuote(target, bucket.lines),
        roots,
        anchorOrder: `${bucket.targetFile}:${lineKey(bucket.lines)}`,
      },
    ];
  });
}

function buildFileCommentGroups(events: AnyEventRecord[]): CommentGroup[] {
  const buckets = collectFileBuckets(events);
  return [...buckets.entries()].flatMap(([key, bucket]) => {
    const roots = buildThreads(bucket.comments);
    if (roots.length === 0) return [];
    const base = bucket.filePath.split("/").pop() ?? bucket.filePath;
    return [
      {
        key,
        targetFile: bucket.filePath,
        filePath: bucket.filePath,
        ...(bucket.lines === undefined ? {} : { lines: bucket.lines }),
        ...(bucket.hunk === undefined ? {} : { hunk: bucket.hunk }),
        ...(bucket.base === undefined ? {} : { base: bucket.base }),
        ...(bucket.lineContext === undefined
          ? {}
          : { lineContext: bucket.lineContext }),
        title: base,
        quote: extractFileQuote(bucket),
        roots,
        anchorOrder: `~file:${key}`,
      },
    ];
  });
}

function collectEventBuckets(events: AnyEventRecord[]): Map<string, EventCommentBucket> {
  const buckets = new Map<string, EventCommentBucket>();
  for (const event of events) {
    if (event.kind !== NO_LOOSE_STRING_VALUES.prose) continue;
    const target = getCommentTarget(event.payload as ProsePayload);
    if (target === undefined) continue;
    const key = targetKey(target.anchor, target.lines);
    const existing = buckets.get(key);
    if (existing === undefined) {
      buckets.set(key, {
        targetFile: target.anchor,
        ...(target.lines === undefined ? {} : { lines: target.lines }),
        comments: [event],
      });
    } else {
      existing.comments.push(event);
    }
  }
  return buckets;
}

function collectFileBuckets(events: AnyEventRecord[]): Map<string, FileCommentBucket> {
  const buckets = new Map<string, FileCommentBucket>();
  for (const event of events) {
    if (event.kind !== NO_LOOSE_STRING_VALUES.prose) continue;
    const payload = event.payload as ProsePayload;
    const target = getFileCommentTarget(payload);
    if (target === undefined) continue;
    const key = fileTargetKey(target.file_path, {
      lines: target.lines,
      hunk: target.hunk,
      base: target.base,
    });
    const existing = buckets.get(key);
    if (existing === undefined) {
      buckets.set(key, {
        filePath: target.file_path,
        ...(target.lines === undefined ? {} : { lines: target.lines }),
        ...(target.hunk === undefined ? {} : { hunk: target.hunk }),
        ...(target.base === undefined ? {} : { base: target.base }),
        ...(payload.line_context === undefined
          ? {}
          : { lineContext: payload.line_context }),
        comments: [event],
      });
    } else {
      existing.comments.push(event);
      if (
        existing.lineContext === undefined &&
        payload.line_context !== undefined
      ) {
        existing.lineContext = payload.line_context;
      }
    }
  }
  return buckets;
}

function deriveTargetTitle(target: AnyEventRecord | undefined, file: string): string {
  if (target === undefined) return file;
  if (target.kind !== NO_LOOSE_STRING_VALUES.prose) return file;
  const payload = target.payload as ProsePayload;
  if (typeof payload.name === "string" && payload.name.trim().length > 0) {
    return payload.name.trim();
  }
  const content = shortPreview(payload.content, 44);
  return content.length > 0 ? content : file;
}

function extractQuote(
  target: AnyEventRecord | undefined,
  lines: LineRange | undefined,
): string | null {
  return quoteFromEventTarget(target, lines);
}

function buildThreads(comments: AnyEventRecord[]): CommentNode[] {
  const byFilename = new Map(comments.map((comment) => [comment.filename, comment]));
  const chainRoot = createChainRootResolver(byFilename);
  const nonMarkers = comments.filter((comment) => !isMarkerEvent(comment));
  const state = collectThreadState(comments, nonMarkers, chainRoot);
  const current = nonMarkers.filter((comment) =>
    isCurrentComment(comment, state, chainRoot),
  );
  const roots = current.filter((comment) => inReplyToOf(comment) === undefined);
  const replies = current.filter((comment) => inReplyToOf(comment) !== undefined);

  return roots
    .map((root) => ({
      event: root,
      replies: replies
        .filter((reply) => belongsToRoot(reply, root, chainRoot))
        .sort(compareEvents),
      resolved: state.resolvedChainRoots.has(chainRoot(root.filename)),
    }))
    .sort((a, b) => compareEvents(a.event, b.event));
}

function collectThreadState(
  comments: AnyEventRecord[],
  nonMarkers: AnyEventRecord[],
  chainRoot: (filename: string) => string,
): {
  edited: Set<string>;
  removedChainRoots: Set<string>;
  resolvedChainRoots: Set<string>;
} {
  const edited = new Set<string>();
  const removedChainRoots = new Set<string>();

  for (const comment of nonMarkers) {
    const supersedes = supersedesOf(comment);
    if (supersedes !== undefined) edited.add(supersedes);
  }
  for (const marker of comments) {
    const supersedes = supersedesOf(marker);
    if (supersedes === undefined) continue;
    if (isRemovedMarker(marker)) removedChainRoots.add(chainRoot(supersedes));
  }
  const resolvedChainRoots = resolvedChainRootsFromComments(comments, chainRoot);

  return { edited, removedChainRoots, resolvedChainRoots };
}

function isCurrentComment(
  comment: AnyEventRecord,
  state: { edited: Set<string>; removedChainRoots: Set<string> },
  chainRoot: (filename: string) => string,
): boolean {
  if (state.edited.has(comment.filename)) return false;
  return !state.removedChainRoots.has(chainRoot(comment.filename));
}

function belongsToRoot(
  reply: AnyEventRecord,
  root: AnyEventRecord,
  chainRoot: (filename: string) => string,
): boolean {
  const inReplyTo = inReplyToOf(reply);
  return inReplyTo !== undefined && chainRoot(inReplyTo) === chainRoot(root.filename);
}

function compareEvents(a: AnyEventRecord, b: AnyEventRecord): number {
  const byTime = a.timestamp.localeCompare(b.timestamp);
  return byTime !== 0 ? byTime : a.filename.localeCompare(b.filename);
}
