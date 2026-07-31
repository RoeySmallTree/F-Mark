import type { GitFileStatus, GitHunk } from "@f-mark/shared";
import type { LineRange } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  untracked: "untracked",
  added: "added",
  binaryUntracked: "binary-untracked",
  binaryAdded: "binary-added",
  deleted: "deleted",
  binaryDeleted: "binary-deleted",
} as const;

/** Whole-file action verb for a status (X3 labelling). */
export function fileActionLabel(status: GitFileStatus): string {
  if (
    status === NO_LOOSE_STRING_VALUES.untracked ||
    status === NO_LOOSE_STRING_VALUES.added ||
    status === NO_LOOSE_STRING_VALUES.binaryUntracked ||
    status === NO_LOOSE_STRING_VALUES.binaryAdded
  ) {
    return "Delete file";
  }
  return "Restore file";
}

/** Per-hunk revert label by status (should-fix 7 / X3). For untracked/added
    files the only hunk is synthetic and whole-file, so reverting it deletes
    the file's content -- say so. */
export function hunkActionLabel(status: GitFileStatus): string {
  if (
    status === NO_LOOSE_STRING_VALUES.deleted ||
    status === NO_LOOSE_STRING_VALUES.binaryDeleted
  ) {
    return "Restore hunk";
  }
  if (
    status === NO_LOOSE_STRING_VALUES.untracked ||
    status === NO_LOOSE_STRING_VALUES.added ||
    status === NO_LOOSE_STRING_VALUES.binaryUntracked ||
    status === NO_LOOSE_STRING_VALUES.binaryAdded
  ) {
    return "Delete hunk";
  }
  return "Revert hunk";
}

/** What the user loses, for the confirmation dialog. Untracked content is not
    in git at all; staged-but-uncommitted content survives only as a dangling
    object recoverable by low-level plumbing. */
export function revertConfirmDetail(status: GitFileStatus): string {
  if (
    status === NO_LOOSE_STRING_VALUES.untracked ||
    status === NO_LOOSE_STRING_VALUES.binaryUntracked
  ) {
    return "This file is untracked, so git cannot restore it. This is permanent.";
  }
  if (
    status === NO_LOOSE_STRING_VALUES.added ||
    status === NO_LOOSE_STRING_VALUES.binaryAdded
  ) {
    return "This file is not committed. Deleting it removes it from disk and the index, and recovering it would need low-level git commands.";
  }
  return "Discards your uncommitted changes to this file.";
}

/* The comment targets the hunk's NEW line range (added/context lines). For a
   pure-delete hunk (new_lines === 0) fall back to a 1-length range anchored at
   the new_start so the comment still resolves to a place in the file. */
export function hunkLineRange(hunk: GitHunk | undefined): LineRange {
  if (hunk === undefined) return [1, 1];
  const start = hunk.new_lines > 0 ? hunk.new_start : Math.max(1, hunk.new_start);
  const end = hunk.new_lines > 0 ? hunk.new_start + hunk.new_lines - 1 : start;
  return [start, end];
}

export function hunkDiffText(hunk: GitHunk): string {
  return `${hunk.header}\n${hunk.patch}`;
}

/* A short preview of the hunk's added/context lines for the comment popover. */
export function hunkSnippet(hunk: GitHunk | undefined): string {
  if (hunk === undefined) return "";
  const lines = hunk.patch
    .split("\n")
    .filter((line) => line.startsWith("+") || line.startsWith(" "))
    .map((line) => line.slice(1))
    .filter((line) => line.trim().length > 0);
  return lines.slice(0, 2).join(" ⏎ ").slice(0, 120);
}
