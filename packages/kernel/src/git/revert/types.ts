import type { GitFileStatus, GitHunk, GitRevertAction } from "@f-mark/shared";

export interface RevertContext {
  root: string;
  /** Root-relative POSIX path (the new path for renames). */
  relPosix: string;
  /** Root-relative POSIX old path for a rename, when known. */
  oldPath?: string;
  /** The file's git status (drives which operation runs). */
  status: GitFileStatus;
  /** Validated merge-base sha (the base tree for restores). */
  mergeBaseSha: string;
  /** Authoritative single-hunk patch body, recomputed server-side. */
  hunk?: GitHunk;
}

export interface GitMutator {
  revert(ctx: RevertContext, action: GitRevertAction): Promise<GitRevertAction>;
}
