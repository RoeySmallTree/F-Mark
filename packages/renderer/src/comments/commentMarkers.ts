import type { AnyEventRecord, ProsePayload } from "@f-mark/shared";
import { EVENT_KINDS } from "@f-mark/shared";

export const COMMENT_MARKER_CONTENT = {
  removed: "_removed_",
  resolved: "_resolved_",
  unresolved: "_unresolved_",
} as const;

function prosePayload(event: AnyEventRecord): ProsePayload | null {
  if (event.kind !== EVENT_KINDS.prose) return null;
  return event.payload as ProsePayload;
}

function markerContent(payload: ProsePayload): string {
  return (payload.content ?? "").trim();
}

export function supersedesOf(event: AnyEventRecord): string | undefined {
  const payload = prosePayload(event);
  if (payload === null) return undefined;
  const supersedes = payload.supersedes;
  return typeof supersedes === "string" && supersedes.length > 0
    ? supersedes
    : undefined;
}

export function isRemovedMarker(event: AnyEventRecord): boolean {
  const payload = prosePayload(event);
  if (payload === null) return false;
  return (
    markerContent(payload) === COMMENT_MARKER_CONTENT.removed &&
    typeof payload.supersedes === "string"
  );
}

export function isResolvedMarker(event: AnyEventRecord): boolean {
  const payload = prosePayload(event);
  if (payload === null) return false;
  return (
    markerContent(payload) === COMMENT_MARKER_CONTENT.resolved &&
    typeof payload.supersedes === "string"
  );
}

export function isUnresolvedMarker(event: AnyEventRecord): boolean {
  const payload = prosePayload(event);
  if (payload === null) return false;
  return (
    markerContent(payload) === COMMENT_MARKER_CONTENT.unresolved &&
    typeof payload.supersedes === "string"
  );
}

export function isResolutionMarker(event: AnyEventRecord): boolean {
  return isResolvedMarker(event) || isUnresolvedMarker(event);
}

export function isMarkerEvent(event: AnyEventRecord): boolean {
  return isRemovedMarker(event) || isResolutionMarker(event);
}

function compareEvents(a: AnyEventRecord, b: AnyEventRecord): number {
  const byTime = a.timestamp.localeCompare(b.timestamp);
  return byTime !== 0 ? byTime : a.filename.localeCompare(b.filename);
}

export function createChainRootResolver(
  byFilename: Map<string, AnyEventRecord>,
): (filename: string) => string {
  return (filename: string): string => {
    const seen = new Set<string>();
    let current = filename;
    for (let i = 0; i < 64; i++) {
      if (seen.has(current)) return current;
      seen.add(current);
      const event = byFilename.get(current);
      if (event === undefined || isMarkerEvent(event)) return current;
      const supersedes = supersedesOf(event);
      if (supersedes === undefined) return current;
      current = supersedes;
    }
    return current;
  };
}

function inReplyToOf(event: AnyEventRecord): string | undefined {
  const payload = prosePayload(event);
  if (payload === null) return undefined;
  const inReplyTo = payload.in_reply_to;
  return typeof inReplyTo === "string" && inReplyTo.length > 0
    ? inReplyTo
    : undefined;
}

/** Resolve a comment to its **thread root** by walking the `in_reply_to` chain
 *  (each hop normalized through the edit `chainRoot`) up to the top-level
 *  comment. Agents reply to the specific message they answer, so replies nest
 *  (reply → reply → root); grouping by the direct parent would orphan the deeper
 *  reply. Built from the bucket-scoped `byFilename`, so a reply whose parent
 *  lives on another target — or is missing/cyclic — resolves to a non-matching
 *  sentinel and stays orphaned instead of grafting onto the wrong thread. */
export function createThreadRootResolver(
  byFilename: Map<string, AnyEventRecord>,
  chainRoot: (filename: string) => string,
): (filename: string) => string {
  return (filename: string): string => {
    const seen = new Set<string>();
    let current = chainRoot(filename);
    for (let i = 0; i < 64; i++) {
      if (seen.has(current)) return current;
      seen.add(current);
      const event = byFilename.get(current);
      if (event === undefined || isMarkerEvent(event)) return current;
      const parent = inReplyToOf(event);
      if (parent === undefined) return current;
      current = chainRoot(parent);
    }
    return current;
  };
}

/** Whether a thread root is resolved after applying resolve/unresolve markers
 *  (last marker wins, keyed on the superseded filename / root). */
export function isThreadResolved(
  comments: AnyEventRecord[],
  rootFilename: string,
): boolean {
  let resolved = false;
  const markers = comments
    .filter((comment) => {
      if (!isResolutionMarker(comment)) return false;
      return supersedesOf(comment) === rootFilename;
    })
    .sort(compareEvents);
  for (const marker of markers) {
    resolved = isResolvedMarker(marker);
  }
  return resolved;
}

/** Collect chain-root filenames that are currently resolved. */
export function resolvedChainRootsFromComments(
  comments: AnyEventRecord[],
  chainRoot: (filename: string) => string,
): Set<string> {
  const roots = new Set<string>();
  const markers = comments.filter(isResolutionMarker).sort(compareEvents);
  for (const marker of markers) {
    const supersedes = supersedesOf(marker);
    if (supersedes === undefined) continue;
    const root = chainRoot(supersedes);
    if (isResolvedMarker(marker)) roots.add(root);
    else roots.delete(root);
  }
  return roots;
}
