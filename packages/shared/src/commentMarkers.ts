/* Comment supersession markers.
 *
 * F-Mark has two deletion mechanisms, and for a long time only one of them was
 * understood outside the renderer:
 *
 *   - the generic prose tombstone: `removed: true` frontmatter, honoured by
 *     `kernel/events/visible.ts`
 *   - comment removal: a prose event whose *content* is the marker
 *     `"_removed_"`, honoured by the renderer only
 *
 * The obvious unification — make comment removal write `removed: true` — is
 * rejected by the kernel on purpose. `ProseFrontmatterValidator` returns
 * "comments cannot be tombstones" for `mode: "comment"` + `removed: true`, and
 * every comment written through the renderer carries `mode: "comment"`. The
 * content marker exists precisely because that door is closed.
 *
 * So the marker stays, and this module is where its definition lives, so the
 * kernel and the renderer read it the same way instead of each keeping a copy.
 */

import type { AnyEventRecord, ProsePayload } from "./events.js";

export const COMMENT_MARKER_CONTENT = {
  removed: "_removed_",
  resolved: "_resolved_",
  unresolved: "_unresolved_",
} as const;

const PROSE_KIND = "prose";

function markerBody(event: AnyEventRecord): {
  content: string;
  supersedes: unknown;
} | null {
  if (event.kind !== PROSE_KIND) return null;
  const payload = event.payload as ProsePayload;
  return {
    content: (payload.content ?? "").trim(),
    supersedes: payload.supersedes,
  };
}

function isMarker(event: AnyEventRecord, marker: string): boolean {
  const body = markerBody(event);
  if (body === null) return false;
  return body.content === marker && typeof body.supersedes === "string";
}

/** A marker that removes the comment it supersedes. */
export function isCommentRemovedMarker(event: AnyEventRecord): boolean {
  return isMarker(event, COMMENT_MARKER_CONTENT.removed);
}

/** A marker that resolves or unresolves the thread it supersedes. */
export function isCommentResolutionMarker(event: AnyEventRecord): boolean {
  return (
    isMarker(event, COMMENT_MARKER_CONTENT.resolved) ||
    isMarker(event, COMMENT_MARKER_CONTENT.unresolved)
  );
}

/**
 * Any comment supersession marker.
 *
 * These carry no prose a reader wants: they are bookkeeping that happens to be
 * shaped like a message. `applySupersession` already hides the event a marker
 * supersedes, so hiding the marker itself is what stops a removed comment from
 * surfacing as the literal string `_removed_` in search, the inbox, and the
 * `fmark_*` MCP tools.
 */
export function isCommentMarkerEvent(event: AnyEventRecord): boolean {
  return isCommentRemovedMarker(event) || isCommentResolutionMarker(event);
}
