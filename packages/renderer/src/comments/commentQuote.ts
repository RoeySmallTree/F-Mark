import {
  EVENT_KINDS,
  getFileCommentTarget,
  type AnyEventRecord,
  type ProsePayload,
} from "@f-mark/shared";
import { lineContextForFileComment } from "./lineContextLookup.js";

export type LineRange = [number, number];

export function shortPreview(text: string, max = 170): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

/** Prefer `line_context.selected`, fall back to diff hunk text. */
export function quoteFromLineContext(payload: ProsePayload): string | null {
  const selected = payload.line_context?.selected;
  if (typeof selected === "string" && selected.trim().length > 0) {
    return trimQuote(selected);
  }
  if (typeof payload.diff_hunk === "string" && payload.diff_hunk.trim().length > 0) {
    return trimQuote(payload.diff_hunk);
  }
  return null;
}

function trimQuote(text: string, max = 170): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

/** Extract quoted lines from an event-anchored prose target. */
export function quoteFromEventTarget(
  target: AnyEventRecord | undefined,
  lines: LineRange | undefined,
): string | null {
  if (target === undefined || target.kind !== EVENT_KINDS.prose) return null;
  const content = (target.payload as ProsePayload).content ?? "";
  if (content.trim().length === 0) return null;
  if (lines === undefined) return shortPreview(content, 170);
  return extractLineQuote(content, lines);
}

function extractLineQuote(content: string, lines: LineRange): string | null {
  const all = content.split(/\r?\n/);
  const start = Math.max(1, lines[0]);
  const end = Math.min(all.length, Math.max(start, lines[1]));
  if (start > all.length) return null;
  const slice = all.slice(start - 1, end).join("\n");
  if (slice.trim().length === 0) return null;
  return trimQuote(slice);
}

export function fileRefLabel(
  filePath: string,
  lines?: LineRange,
): string {
  const base = filePath.split("/").pop() ?? filePath;
  if (lines === undefined) return base;
  return lines[0] === lines[1]
    ? `${base}:${lines[0]}`
    : `${base}:${lines[0]}-${lines[1]}`;
}

interface FileQuoteBucket {
  hunk?: string;
  lineContext?: ProsePayload["line_context"];
  comments: AnyEventRecord[];
}

/** Quote for a file-comment group: line_context from bucket, else hunk. */
export function extractFileQuote(
  bucket: FileQuoteBucket & { fileText?: string; lines?: LineRange },
): string | null {
  if (bucket.lineContext?.selected !== undefined) {
    const selected = bucket.lineContext.selected.trim();
    if (selected.length > 0) return trimQuote(selected);
  }
  for (const comment of bucket.comments) {
    const fromPayload = quoteFromLineContext(comment.payload as ProsePayload);
    if (fromPayload !== null) return fromPayload;
  }
  if (bucket.hunk !== undefined && bucket.hunk.trim().length > 0) {
    return trimQuote(bucket.hunk);
  }
  if (
    bucket.fileText !== undefined &&
    bucket.lines !== undefined &&
    bucket.fileText.length > 0
  ) {
    return extractLineQuote(bucket.fileText, bucket.lines);
  }
  return null;
}

/** Resolve a file-comment thread quote from stored context or live file text. */
export function quoteForFileCommentAtLines(input: {
  events: AnyEventRecord[];
  filePath: string;
  lines: LineRange;
  fileText?: string;
}): string | null {
  const lineContext = lineContextForFileComment(
    input.events,
    input.filePath,
    input.lines,
  );
  const comments = input.events.filter((event) => {
    const target = getFileCommentTarget(event.payload as ProsePayload);
    if (target === undefined) return false;
    if (target.file_path !== input.filePath) return false;
    if (
      target.lines === undefined ||
      target.lines[0] !== input.lines[0] ||
      target.lines[1] !== input.lines[1]
    ) {
      return false;
    }
    return true;
  });
  return extractFileQuote({
    comments,
    ...(lineContext !== undefined ? { lineContext } : {}),
    ...(input.fileText !== undefined ? { fileText: input.fileText } : {}),
    lines: input.lines,
  });
}
