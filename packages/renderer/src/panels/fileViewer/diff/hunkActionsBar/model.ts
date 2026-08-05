import type { GitFileStatus, GitHunk, GitRevertAction } from "@f-mark/shared";
import type { LineRange } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  untracked: "untracked",
  added: "added",
  binaryUntracked: "binary-untracked",
  binaryAdded: "binary-added",
  deleted: "deleted",
  binaryDeleted: "binary-deleted",
  hunk: "hunk",
  rename: "rename",
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

/** Confirmation title verb for a revert action (hunk / rename / file), so the
    dialog always names what the button named — the button and the dialog
    must never disagree (X3 premise). "rename" has no per-status variants:
    it always moves the file back to its old path, so it always reads "Undo
    rename", matching the button text in HunkActionsBarView. */
export function revertActionLabel(
  action: GitRevertAction,
  status: GitFileStatus,
): string {
  if (action === NO_LOOSE_STRING_VALUES.hunk) return hunkActionLabel(status);
  if (action === NO_LOOSE_STRING_VALUES.rename) return "Undo rename";
  return fileActionLabel(status);
}

const UNTRACKED_PERMANENT_DETAIL =
  "This file is untracked, so git cannot restore it. This is permanent.";
const ADDED_LOW_LEVEL_DETAIL =
  "This file is not committed. Deleting it removes it from disk and the index, and recovering it would need low-level git commands.";
const FILE_DISCARD_DETAIL = "Discards your uncommitted changes to this file.";
const HUNK_DISCARD_DETAIL = "Discards your uncommitted changes to this hunk.";
const FILE_RESTORE_DETAIL =
  "Restores the file from the base. Nothing is discarded.";
const HUNK_RESTORE_DETAIL =
  "Restores this hunk's lines. Nothing is discarded.";
const RENAME_DETAIL = "Moves the file back to its original path.";

/** What the user loses, for the confirmation dialog. Must match `action`,
    not just `status`: a hunk revert only loses the hunk (except on
    untracked/added files, where the single hunk IS the whole file, so it
    keeps the file-level warning); a rename loses nothing. Untracked content
    is not in git at all; staged-but-uncommitted content survives only as a
    dangling object recoverable by low-level plumbing; a Restore (on a
    deleted file) is not destructive at all and must not read like one
    (should-fix — over-warning trains users to dismiss dialogs). */
export function revertConfirmDetail(
  action: GitRevertAction,
  status: GitFileStatus,
): string {
  if (action === NO_LOOSE_STRING_VALUES.rename) return RENAME_DETAIL;

  const isUntracked =
    status === NO_LOOSE_STRING_VALUES.untracked ||
    status === NO_LOOSE_STRING_VALUES.binaryUntracked;
  const isAdded =
    status === NO_LOOSE_STRING_VALUES.added ||
    status === NO_LOOSE_STRING_VALUES.binaryAdded;
  const isDeleted =
    status === NO_LOOSE_STRING_VALUES.deleted ||
    status === NO_LOOSE_STRING_VALUES.binaryDeleted;

  if (isUntracked) return UNTRACKED_PERMANENT_DETAIL;
  if (isAdded) return ADDED_LOW_LEVEL_DETAIL;
  if (isDeleted) {
    return action === NO_LOOSE_STRING_VALUES.hunk
      ? HUNK_RESTORE_DETAIL
      : FILE_RESTORE_DETAIL;
  }
  return action === NO_LOOSE_STRING_VALUES.hunk ? HUNK_DISCARD_DETAIL : FILE_DISCARD_DETAIL;
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
