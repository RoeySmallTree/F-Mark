import type { AnyEventRecord, ProsePayload } from "@f-mark/shared";
import { getCommentTarget } from "@f-mark/shared";
import {
  isThreadResolved,
} from "../../comments/commentMarkers.js";
import type {
  CommentLineRange,
  CommentPayload,
  CommentThreadModel,
  CommentThreadRow,
} from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  deleted: "(deleted)",
  empty: "(empty)",
  prose: "prose",
} as const;

interface BuildCommentThreadModelInput {
  events: AnyEventRecord[];
  comments: AnyEventRecord[];
  targetFile: string;
  lines: CommentLineRange | undefined;
}

export function isResolvedComment(
  comment: AnyEventRecord,
  allComments: AnyEventRecord[],
): boolean {
  return isThreadResolved(allComments, comment.filename);
}

export function buildCommentThreadModel(
  input: BuildCommentThreadModelInput,
): CommentThreadModel {
  const target = input.events.find((event) => event.filename === input.targetFile);
  const allTargetComments = getTargetComments(input.events, input.targetFile);
  const roots = getThreadRoots(input.comments);
  const resolvedRoots = getResolvedRoots(allTargetComments);
  const allRoots = mergeRoots(roots, resolvedRoots);

  return {
    target,
    targetTitle: deriveTargetTitle(target),
    lines: input.lines,
    quotedLines: extractLines(target, input.lines),
    allTargetComments,
    threads: buildThreadRows(allRoots, allTargetComments),
  };
}

function buildThreadRows(
  roots: AnyEventRecord[],
  allTargetComments: AnyEventRecord[],
): CommentThreadRow[] {
  return roots.map((root) => ({
    root,
    resolved: isResolvedComment(root, allTargetComments),
  }));
}

function deriveTargetTitle(target: AnyEventRecord | undefined): string {
  if (target === undefined) return NO_LOOSE_STRING_VALUES.deleted;
  const payload = target.payload as ProsePayload;
  if (typeof payload.name === "string" && payload.name.length > 0) {
    return payload.name;
  }
  const content = (payload.content ?? "").replace(/\s+/g, " ").trim();
  if (content.length === 0) return NO_LOOSE_STRING_VALUES.empty;
  if (content.length <= 40) return content;
  return content.slice(0, 40);
}

function extractLines(
  target: AnyEventRecord | undefined,
  lines: CommentLineRange | undefined,
): string | null {
  if (target === undefined || lines === undefined) return null;
  const content = (target.payload as ProsePayload).content ?? "";
  const all = content.split(/\r?\n/);
  const [start, end] = lines;
  const first = Math.max(1, start);
  const last = Math.min(all.length, Math.max(first, end));
  if (first > all.length) return null;
  return all.slice(first - 1, last).join("\n");
}

function getTargetComments(
  events: AnyEventRecord[],
  targetFile: string,
): AnyEventRecord[] {
  return events.filter((event) => {
    if (event.kind !== NO_LOOSE_STRING_VALUES.prose) return false;
    const target = getCommentTarget(event.payload as ProsePayload);
    return target !== undefined && target.anchor === targetFile;
  });
}

function getThreadRoots(comments: AnyEventRecord[]): AnyEventRecord[] {
  return comments.filter(isThreadRoot);
}

function getResolvedRoots(comments: AnyEventRecord[]): AnyEventRecord[] {
  return comments.filter((comment) => {
    return isThreadRoot(comment) && isThreadResolved(comments, comment.filename);
  });
}

function mergeRoots(
  roots: AnyEventRecord[],
  resolvedRoots: AnyEventRecord[],
): AnyEventRecord[] {
  const merged = [...roots];
  const seen = new Set(merged.map((root) => root.filename));
  for (const root of resolvedRoots) {
    if (seen.has(root.filename)) continue;
    merged.push(root);
    seen.add(root.filename);
  }
  return merged;
}

function isThreadRoot(comment: AnyEventRecord): boolean {
  const inReplyTo = getInReplyTo(comment);
  return inReplyTo === undefined || inReplyTo.length === 0;
}

function getInReplyTo(comment: AnyEventRecord): string | undefined {
  const inReplyTo = (comment.payload as CommentPayload).in_reply_to;
  return typeof inReplyTo === "string" ? inReplyTo : undefined;
}
