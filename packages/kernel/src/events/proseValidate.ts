/* proseValidate - public facade for prose frontmatter validation.
   Pure functions; no I/O, no parent lookup. Used by the prose POST route
   before write. */

import { ProseFrontmatterValidator } from "./proseValidation/ProseFrontmatterValidator.js";
import type {
  ValidateInput,
  ValidateResult,
} from "./proseValidation/types.js";

export type { ValidateInput, ValidateResult } from "./proseValidation/types.js";
export { EVENT_FILENAME_RE } from "./proseValidation/filename.js";
export { validateNonProseAppendTo } from "./proseValidation/appendTarget.js";

/** Validate a prose payload's mutual-exclusion rules. Shape-only — does
    NOT look up the parent referenced by `append_to`. */
export function validateProseFrontmatter(input: ValidateInput): ValidateResult {
  return new ProseFrontmatterValidator(input).validate();
}
