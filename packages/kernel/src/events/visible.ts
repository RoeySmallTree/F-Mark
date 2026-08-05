import type { AnyEventRecord, ProsePayload } from "@f-mark/shared";
import { isCommentMarkerEvent } from "@f-mark/shared";
import type { Paths } from "../paths.js";
import { readEvents, type ReadOptions } from "./reader.js";
import { applySupersession } from "./supersession.js";

/** A `removed: true` prose tombstone is an internal supersession marker, not a
   message — hide it from visible reads (the renderer aggregate does the same). */
function isProseTombstone(event: AnyEventRecord): boolean {
  return (
    event.kind === "prose" && (event.payload as ProsePayload).removed === true
  );
}

/* Comment removal cannot use the `removed: true` tombstone — the prose
   validator rejects `mode: "comment"` with `removed: true` ("comments cannot be
   tombstones"), so the renderer supersedes the comment with an event whose
   content is the marker `_removed_`. `applySupersession` above already drops
   the comment that marker supersedes; without this the marker itself survived
   as a visible prose event, which is how the literal string `_removed_` reached
   search, the inbox, and the fmark_* MCP tools. */
function isSupersessionMarker(event: AnyEventRecord): boolean {
  return isProseTombstone(event) || isCommentMarkerEvent(event);
}

/**
 * Read events with superseded ones hidden — the view public/read-user paths
 * (events route, search, inbox) should present. A coalesced assistant message
 * supersedes the streamed delta files it replaces, so those fragments do not
 * leak into search results, MCP `read_events`, or inbox wake-ups.
 *
 * `readEvents` stays the raw append-only reader for internal callers (dedupe,
 * the coalescer, access-response lookup) that need full history.
 */
export async function readVisibleEvents(
  p: Paths,
  sessionId: string,
  opts: ReadOptions,
): Promise<AnyEventRecord[]> {
  return applySupersession(await readEvents(p, sessionId, opts)).filter(
    (event) => !isSupersessionMarker(event),
  );
}
