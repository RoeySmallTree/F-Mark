/* proseValidate — mutual-exclusion validator for prose frontmatter.
   Pure function; no I/O, no parent lookup. Used by the prose POST route
   before write. See planning/composable-prose/plan.md "Mutual-exclusion
   validation" table for the rule list. */

import type { ProsePayload } from "@f-mark/shared";

export interface ValidateInput {
  /** Frontmatter+content fields the caller intends to write. */
  content?: string;
  name?: string;
  append_to?: unknown;
  mode?: unknown;
  lines?: unknown;
  removed?: unknown;
  /** File/diff comment target. Mutually exclusive with `append_to`/`mode`. */
  file_path?: unknown;
}

export type ValidateResult = { ok: true } | { ok: false; error: string };

/* {2,16} segment — accommodates the longest runtime slug "opencode"
   (ids like `ag-opencode-3a2f`). Lockstep with ID_PATTERN (participants.ts)
   and FILENAME_REGEX (shared/filenames.ts). */
export const EVENT_FILENAME_RE =
  /^\d{8}T\d{6}(?:\.\d{3})?Z_(?:us|ag|sys|grp)-[a-z0-9-]{2,16}\.[a-z-]+(?:\.[a-z0-9]+)?$/;

/** Shared `append_to` shape check for non-prose routes. Non-prose
 *  payloads have no `mode`/`lines`/`target`/`name`-vs-append_to rules to
 *  enforce, but they DO share the event-filename pattern requirement
 *  so the renderer aggregate can match parents reliably. */
export function validateNonProseAppendTo(
  append_to: unknown,
): ValidateResult {
  if (append_to === undefined) return { ok: true };
  if (typeof append_to !== "string" || append_to.length === 0) {
    return { ok: false, error: "`append_to` must be a non-empty string" };
  }
  if (!EVENT_FILENAME_RE.test(append_to)) {
    return {
      ok: false,
      error: "`append_to` does not match event-filename pattern",
    };
  }
  return { ok: true };
}

function isPositiveInt(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isInteger(value) && value > 0
  );
}

/** Validate a prose payload's mutual-exclusion rules. Shape-only — does
    NOT look up the parent referenced by `append_to`. */
export function validateProseFrontmatter(input: ValidateInput): ValidateResult {
  /* File/diff comment — keyed on `file_path`. A self-contained comment target
     (a repo path), mutually exclusive with the event-anchored `append_to`/
     `mode` shape. */
  const hasFilePath =
    typeof input.file_path === "string" && input.file_path.length > 0;
  if (input.file_path !== undefined && typeof input.file_path !== "string") {
    return { ok: false, error: "`file_path` must be a string" };
  }
  if (
    hasFilePath &&
    (input.append_to !== undefined || input.mode !== undefined)
  ) {
    return {
      ok: false,
      error: "`file_path` is mutually exclusive with `append_to`/`mode`",
    };
  }

  /* `append_to === ""` — reject. Filenames are non-empty strings. */
  if (typeof input.append_to === "string" && input.append_to.length === 0) {
    return { ok: false, error: "`append_to` must be a non-empty filename" };
  }
  if (
    input.append_to !== undefined &&
    typeof input.append_to !== "string"
  ) {
    return { ok: false, error: "`append_to` must be a string filename" };
  }
  /* `append_to` shape check — must match event filename pattern. */
  if (
    typeof input.append_to === "string" &&
    input.append_to.length > 0 &&
    !EVENT_FILENAME_RE.test(input.append_to)
  ) {
    return {
      ok: false,
      error: "`append_to` does not match event-filename pattern",
    };
  }

  /* `mode` without `append_to` — reject. */
  if (
    input.mode !== undefined &&
    (input.append_to === undefined || input.append_to === "")
  ) {
    return { ok: false, error: "`mode` requires `append_to`" };
  }
  /* `mode` enum check. */
  if (
    input.mode !== undefined &&
    input.mode !== "content" &&
    input.mode !== "comment"
  ) {
    return { ok: false, error: "`mode` must be 'content' or 'comment'" };
  }

  /* `lines` requires either `mode: "comment"` (event comment) or `file_path`
     (file/diff comment). */
  if (input.lines !== undefined && input.mode !== "comment" && !hasFilePath) {
    return {
      ok: false,
      error: '`lines` requires `mode: "comment"` or `file_path`',
    };
  }

  /* `lines` value sanity — array of two positive integers, start <= end. */
  if (input.lines !== undefined) {
    if (!Array.isArray(input.lines) || input.lines.length !== 2) {
      return { ok: false, error: "`lines` must be a 2-element array" };
    }
    const [a, b] = input.lines;
    if (!isPositiveInt(a) || !isPositiveInt(b)) {
      return { ok: false, error: "`lines` entries must be positive integers" };
    }
    if (a > b) {
      return { ok: false, error: "`lines` start must be <= end" };
    }
  }

  /* `mode === "comment"` + `name` set — reject. */
  if (
    input.mode === "comment" &&
    typeof input.name === "string" &&
    input.name.length > 0
  ) {
    return { ok: false, error: "comments must not carry `name`" };
  }

  /* `mode === "comment"` + `removed === true` — reject. */
  if (input.mode === "comment" && input.removed === true) {
    return { ok: false, error: "comments cannot be tombstones" };
  }

  /* `removed === true` + `content` non-empty — reject. */
  if (
    input.removed === true &&
    typeof input.content === "string" &&
    input.content.trim().length > 0
  ) {
    return { ok: false, error: "`removed: true` requires empty content" };
  }

  return { ok: true };
}
