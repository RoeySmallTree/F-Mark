import type { GitFileStatus, GitHunk } from "@f-mark/shared";
import { isSafeRef } from "../service.js";
import { RevertFailedError, RevertNotAllowedError } from "./errors.js";
import type { RevertContext } from "./types.js";

export type FileRevertKind = "delete" | "rename" | "restore";

const binaryStatuses = new Set<GitFileStatus>([
  "binary-added",
  "binary-modified",
  "binary-deleted",
  "binary-renamed",
  "binary-untracked",
]);

const deleteStatuses = new Set<GitFileStatus>([
  "untracked",
  "added",
  "binary-untracked",
  "binary-added",
]);

const renameStatuses = new Set<GitFileStatus>([
  "renamed",
  "binary-renamed",
]);

export function assertSafeMergeBase(mergeBaseSha: string): void {
  if (!isSafeRef(mergeBaseSha)) {
    throw new RevertFailedError("invalid base");
  }
}

export function requireRenameOldPath(ctx: RevertContext): string {
  if (ctx.oldPath === undefined || ctx.oldPath.length === 0) {
    throw new RevertNotAllowedError("rename revert requires old_path");
  }
  return ctx.oldPath;
}

export function requireHunk(ctx: RevertContext): GitHunk {
  if (binaryStatuses.has(ctx.status)) {
    throw new RevertNotAllowedError("binary files only support a file-level revert");
  }
  if (ctx.hunk === undefined) {
    throw new RevertNotAllowedError("hunk revert requires a hunk_id");
  }
  return ctx.hunk;
}

export function fileRevertKind(status: GitFileStatus): FileRevertKind {
  if (deleteStatuses.has(status)) return "delete";
  if (renameStatuses.has(status)) return "rename";
  return "restore";
}

export function isAddedLikeStatus(status: GitFileStatus): boolean {
  return status === "untracked" || status === "added";
}
