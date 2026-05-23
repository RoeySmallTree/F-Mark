/* blocks — kind-agnostic helpers around `append_to` and the comment shape.
   Pure shape-normalisers; do NOT walk supersession (review_2 finding C). */

import type { AnyEventRecord, ProsePayload } from "./events.js";
import { getProseRole } from "./proseRoles.js";

/** Read the `append_to` field across any event kind. Returns `undefined`
    if the payload doesn't carry one or if it's not a non-empty string. */
export function getAppendTo(event: AnyEventRecord): string | undefined {
  const payload = event.payload as { append_to?: unknown };
  const a = payload.append_to;
  return typeof a === "string" && a.length > 0 ? a : undefined;
}

/** True when the event is a composable block — i.e. carries `append_to`
    and is one of the kinds the renderer composes inline. Prose comments
    still have `append_to`+`mode: "comment"` so we must explicitly exclude
    them (they ride the comments path, not the block list). */
export function isComposableBlock(event: AnyEventRecord): boolean {
  if (getAppendTo(event) === undefined) return false;
  if (event.kind === "prose") {
    const role = getProseRole(event.payload as ProsePayload);
    return role.kind !== "comment";
  }
  return (
    event.kind === "flow" ||
    event.kind === "file" ||
    event.kind === "html" ||
    event.kind === "choices" ||
    event.kind === "todo" ||
    event.kind === "tool-use"
  );
}

/** True when the event is a named anchor — i.e. a prose event whose role
    is `anchor`. Used by the named rail and command palette so named
    sub-blocks (`named-block`) never leak into the global "named" list. */
export function isNamedAnchor(event: AnyEventRecord): boolean {
  if (event.kind !== "prose") return false;
  return getProseRole(event.payload as ProsePayload).kind === "anchor";
}

/** Read the comment target off a prose payload. Returns `undefined`
    when the role isn't `comment`. Shape-only — no supersession walk. */
export function getCommentTarget(
  payload: ProsePayload,
): { anchor: string; lines?: [number, number] } | undefined {
  const role = getProseRole(payload);
  if (role.kind !== "comment") return undefined;
  return role.lines === undefined
    ? { anchor: role.anchor }
    : { anchor: role.anchor, lines: role.lines };
}
