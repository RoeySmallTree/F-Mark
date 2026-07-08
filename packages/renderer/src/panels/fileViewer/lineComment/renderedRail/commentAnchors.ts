import type { AnyEventRecord, ProsePayload } from "@f-mark/shared";
import { getFileCommentTarget } from "@f-mark/shared";
import {
  createChainRootResolver,
  isMarkerEvent,
  isRemovedMarker,
  resolvedChainRootsFromComments,
  supersedesOf,
} from "../../../../comments/commentMarkers.js";
import type { CommentTarget } from "../../../../state/store.js";
import { normalizeLines, type LineRange } from "../lineMeasure.js";

const NO_LOOSE_STRING_VALUES = {
  prose: "prose",
  file: "file",
} as const;

export interface RenderedCommentAnchor {
  key: string;
  lines: LineRange;
  count: number;
  resolved: boolean;
}

function lineKey(lines: LineRange): string {
  return `${lines[0]}:${lines[1]}`;
}

export function rangeEquals(a: LineRange, b: LineRange): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function chainRootOf(
  byFilename: Map<string, AnyEventRecord>,
  filename: string,
): string {
  return createChainRootResolver(byFilename)(filename);
}

function collectChainState(
  events: AnyEventRecord[],
  byFilename: Map<string, AnyEventRecord>,
): { removedRoots: Set<string>; resolvedRoots: Set<string> } {
  const chainRoot = (filename: string) => chainRootOf(byFilename, filename);
  const removedRoots = new Set<string>();
  for (const event of events) {
    const sup = supersedesOf(event);
    if (sup === undefined) continue;
    if (isRemovedMarker(event)) removedRoots.add(chainRoot(sup));
  }
  const resolvedRoots = resolvedChainRootsFromComments(events, chainRoot);
  return { removedRoots, resolvedRoots };
}

function anchorForEvent({
  event,
  scopedPath,
  lineCount,
  byFilename,
  removedRoots,
  resolvedRoots,
}: {
  event: AnyEventRecord;
  scopedPath: string;
  lineCount: number;
  byFilename: Map<string, AnyEventRecord>;
  removedRoots: Set<string>;
  resolvedRoots: Set<string>;
}): { key: string; lines: LineRange; resolved: boolean } | null {
  if (event.kind !== NO_LOOSE_STRING_VALUES.prose || isMarkerEvent(event)) return null;
  const fileTarget = getFileCommentTarget(event.payload as ProsePayload);
  if (fileTarget === undefined) return null;
  if (fileTarget.file_path !== scopedPath) return null;
  if (fileTarget.lines === undefined) return null;
  const root = chainRootOf(byFilename, event.filename);
  if (removedRoots.has(root)) return null;
  const lines = normalizeLines(fileTarget.lines, lineCount);
  return {
    key: lineKey(lines),
    lines,
    resolved: resolvedRoots.has(root),
  };
}

function upsertAnchor(
  byLine: Map<string, RenderedCommentAnchor>,
  anchor: { key: string; lines: LineRange; resolved: boolean },
): void {
  const existing = byLine.get(anchor.key);
  if (existing === undefined) {
    byLine.set(anchor.key, { ...anchor, count: 1 });
    return;
  }
  existing.count += 1;
  existing.resolved = existing.resolved || anchor.resolved;
}

export function buildFileCommentAnchors({
  events,
  scopedPath,
  lineCount,
}: {
  events: AnyEventRecord[];
  scopedPath: string | null;
  lineCount: number;
}): RenderedCommentAnchor[] {
  if (scopedPath === null) return [];
  const byFilename = new Map(events.map((event) => [event.filename, event]));
  const { removedRoots, resolvedRoots } = collectChainState(events, byFilename);
  const byLine = new Map<string, RenderedCommentAnchor>();
  for (const event of events) {
    const anchor = anchorForEvent({
      event,
      scopedPath,
      lineCount,
      byFilename,
      removedRoots,
      resolvedRoots,
    });
    if (anchor !== null) upsertAnchor(byLine, anchor);
  }
  return [...byLine.values()].sort((a, b) => a.lines[0] - b.lines[0]);
}

export function activeLinesForFileTarget(
  target: CommentTarget | null,
  scopedPath: string | null,
  lineCount: number,
): LineRange | null {
  return target !== null &&
    target.kind === NO_LOOSE_STRING_VALUES.file &&
    scopedPath !== null &&
    target.file_path === scopedPath &&
    target.lines !== undefined
    ? normalizeLines(target.lines, lineCount)
    : null;
}
