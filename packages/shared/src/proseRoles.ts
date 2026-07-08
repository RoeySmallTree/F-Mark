/* proseRoles — enumerated role union for a `ProsePayload`, plus the
   shape-classifier `getProseRole`. Classifies a payload into its role from
   its frontmatter shape (`file_path` → file-comment; `append_to`+`mode`/etc.)
   **without walking the supersedes chain** — live-parent resolution is the
   aggregate's job (review_2 finding C). There is no legacy `target` mapping;
   that field was removed. */

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
  | {
      kind: "file-comment";
      file_path: string;
      lines?: [number, number];
      hunk?: string;
      base?: string;
    }
  | { kind: "tombstone"; anchor: string };

export const PROSE_ROLE_KINDS = {
  message: "message",
  anchor: "anchor",
  namedBlock: "named-block",
  unnamedBlock: "unnamed-block",
  comment: "comment",
  fileComment: "file-comment",
  tombstone: "tombstone",
} as const satisfies Record<string, ProseRole["kind"]>;

/**
 * Classify a `ProsePayload` into its role.
 *
 * **Shape-only:** classifies from frontmatter fields. Does NOT walk
 * supersession — the aggregate owns live-parent resolution.
 *
 * Precedence:
 * 1. `file_path` → `file-comment` (a comment on a repo file/diff hunk)
 * 2. `append_to` + `mode: "comment"` → `comment`
 * 3. `append_to` + `removed: true` → `tombstone`
 * 4. `append_to` + `name` → `named-block`
 * 5. `append_to` (anything else) → `unnamed-block`
 * 6. `name` (no `append_to`) → `anchor`
 * 7. default → `message`
 */
export function getProseRole(payload: ProsePayload): ProseRole {
  /* 1. File/diff comment — keyed on `file_path`. Highest precedence; a file
     comment never carries `append_to` (it targets a repo path, not an
     event). */
  if (
    typeof payload.file_path === "string" &&
    payload.file_path.length > 0
  ) {
    return {
      kind: "file-comment",
      file_path: payload.file_path,
      ...(payload.lines !== undefined ? { lines: payload.lines } : {}),
      ...(payload.diff_hunk !== undefined ? { hunk: payload.diff_hunk } : {}),
      ...(payload.diff_base !== undefined ? { base: payload.diff_base } : {}),
    };
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
