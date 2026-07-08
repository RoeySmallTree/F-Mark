const NO_LOOSE_STRING_VALUES = {
  session: "session",
  currentSession: "current-session",
  wholeBranch: "whole-branch",
} as const;

/* Map the git wire diff mode (session/branch) to the `DiffBase` label stored
   on a file comment's `diff_base`: `session` -> `current-session`,
   `branch` -> `whole-branch`. */

import type { DiffBase, GitDiffMode } from "@f-mark/shared";

export function wireModeToDiffBase(mode: GitDiffMode): DiffBase {
  return mode === NO_LOOSE_STRING_VALUES.session ? NO_LOOSE_STRING_VALUES.currentSession : NO_LOOSE_STRING_VALUES.wholeBranch;
}
