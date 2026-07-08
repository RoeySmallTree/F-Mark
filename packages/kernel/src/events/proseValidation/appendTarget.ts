import { EVENT_FILENAME_RE } from "./filename.js";
import type { ValidateResult } from "./types.js";

/** Shared `append_to` shape check for non-prose routes. Non-prose
 *  payloads have no `mode`/`lines`/`target`/`name`-vs-append_to rules to
 *  enforce, but they DO share the event-filename pattern requirement
 *  so the renderer aggregate can match parents reliably. */
export function validateNonProseAppendTo(
  append_to: unknown,
): ValidateResult {
  if (append_to === undefined) return { ok: true };
  return validateAppendFilename(append_to, {
    empty: "`append_to` must be a non-empty string",
    wrongType: "`append_to` must be a non-empty string",
  });
}

export function validateAppendFilename(
  append_to: unknown,
  messages: { empty: string; wrongType: string },
): ValidateResult {
  if (typeof append_to !== "string") {
    return { ok: false, error: messages.wrongType };
  }
  if (append_to.length === 0) {
    return { ok: false, error: messages.empty };
  }
  if (!EVENT_FILENAME_RE.test(append_to)) {
    return {
      ok: false,
      error: "`append_to` does not match event-filename pattern",
    };
  }
  return { ok: true };
}
