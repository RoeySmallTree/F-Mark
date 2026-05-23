/* proseRoles — enumerated role union for a `ProsePayload`, plus the
   shape-normaliser `getProseRole`. The helper maps legacy `target` onto
   the new `append_to`/`mode`/`lines` shape **without walking the
   supersedes chain** — live-parent resolution is the aggregate's job
   (review_2 finding C). */

import type { ProsePayload } from "./events.js";

/**
 * Role this prose event plays.
 *
 * - `message`            — unnamed top-level prose (a message in the feed).
 * - `anchor`             — named prose with no parent. Header of a document.
 * - `named-block`        — a named sub-section block of a parent doc.
 * - `unnamed-block`      — an unnamed prose block of a parent doc.
 * - `comment`            — a line/card comment targeting a parent event.
 * - `tombstone`          — a removed marker for the parent's chain.
 */
export type ProseRole =
  | { kind: "message" }
  | { kind: "anchor"; name: string }
  | { kind: "named-block"; name: string; anchor: string }
  | { kind: "unnamed-block"; anchor: string }
  | { kind: "comment"; anchor: string; lines?: [number, number] }
  | { kind: "tombstone"; anchor: string };

/**
 * Classify a `ProsePayload` into its role.
 *
 * **Shape-only:** maps legacy `target` if `append_to` absent. Does NOT
 * walk supersession — the aggregate owns live-parent resolution.
 *
 * Precedence:
 * 1. legacy `target` (when `append_to` absent) → `comment` shape
 * 2. `append_to` + `mode: "comment"` → `comment`
 * 3. `append_to` + `removed: true` → `tombstone`
 * 4. `append_to` + `name` → `named-block`
 * 5. `append_to` (anything else) → `unnamed-block`
 * 6. `name` (no `append_to`) → `anchor`
 * 7. default → `message`
 */
export function getProseRole(payload: ProsePayload): ProseRole {
  /* 1. Legacy `target` mapped to the new comment shape. Only honoured
     when `append_to` is absent — if both are present, `append_to` wins
     (the parser warns about that combination separately). */
  if (
    payload.append_to === undefined &&
    payload.target !== undefined &&
    typeof payload.target.file === "string" &&
    payload.target.file.length > 0
  ) {
    const lines = payload.target.lines;
    return lines === undefined
      ? { kind: "comment", anchor: payload.target.file }
      : { kind: "comment", anchor: payload.target.file, lines };
  }

  const appendTo = payload.append_to;
  if (typeof appendTo === "string" && appendTo.length > 0) {
    if (payload.mode === "comment") {
      return payload.lines === undefined
        ? { kind: "comment", anchor: appendTo }
        : { kind: "comment", anchor: appendTo, lines: payload.lines };
    }
    if (payload.removed === true) {
      return { kind: "tombstone", anchor: appendTo };
    }
    if (typeof payload.name === "string" && payload.name.length > 0) {
      return { kind: "named-block", name: payload.name, anchor: appendTo };
    }
    return { kind: "unnamed-block", anchor: appendTo };
  }

  if (typeof payload.name === "string" && payload.name.length > 0) {
    return { kind: "anchor", name: payload.name };
  }
  return { kind: "message" };
}
