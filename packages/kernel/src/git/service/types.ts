import type { GitChangedFile } from "@f-mark/shared";

export interface GitService {
  /** True when `root` is the top of (or inside) a git worktree. */
  isGitWorktree(root: string): Promise<boolean>;
  /** Detect the default base ref: origin/HEAD -> main -> master, else null. */
  detectBaseRef(root: string): Promise<string | null>;
  /** Current branch/ref name, null for detached HEAD or non-git roots. */
  currentRef(root: string): Promise<string | null>;
  /** Local + remote branch refs, short names, excluding symbolic origin/HEAD. */
  branchRefs(root: string): Promise<string[]>;
  /** Resolve a ref to a commit sha (`<ref>^{commit}`), or null if unknown. */
  resolveCommit(root: string, ref: string): Promise<string | null>;
  /** `git merge-base <base> HEAD`, or null when either side is unresolvable. */
  mergeBase(root: string, baseRef: string): Promise<string | null>;
  /** Validate a user-supplied ref via check-ref-format + rev-parse --verify. */
  validateRef(root: string, ref: string): Promise<boolean>;
  /** Changed files (diff union untracked) against `mergeBaseSha`. */
  changedFiles(root: string, mergeBaseSha: string): Promise<GitChangedFile[]>;
  /** Untracked files (`ls-files --others --exclude-standard`), root-relative. */
  untrackedFiles(root: string): Promise<string[]>;
  /** Raw unified diff for one path against `mergeBaseSha`. */
  fileDiff(
    root: string,
    mergeBaseSha: string,
    relPath: string,
    oldPath?: string,
  ): Promise<string>;
  /** Cached (staged) diff for one path: base -> index. */
  fileDiffCached(
    root: string,
    mergeBaseSha: string,
    relPath: string,
    oldPath?: string,
  ): Promise<string>;
  /** Unstaged diff for one path: index -> working tree. */
  fileDiffWorktree(
    root: string,
    relPath: string,
    oldPath?: string,
  ): Promise<string>;
  /** `git show <sha>:<relPath>` as a Buffer; null when absent at that revision. */
  showBlob(
    root: string,
    sha: string,
    relPath: string,
  ): Promise<{ buf: Buffer; truncated: boolean } | null>;
  /** Resolve the blob object id + byte size for `<sha>:<relPath>`. */
  blobInfo(
    root: string,
    sha: string,
    relPath: string,
  ): Promise<{ objectId: string; size: number } | null>;
  /** Stream a byte range of a blob by object id. */
  showBlobRange(
    root: string,
    objectId: string,
    start: number,
    end: number,
  ): NodeJS.ReadableStream;
  /** True when git considers `relPath` (working tree) binary. */
  isBinaryPath(
    root: string,
    mergeBaseSha: string,
    relPath: string,
  ): Promise<boolean>;
}

export interface GitResolvedBase {
  status: "ok" | "not-git" | "base-not-found";
  baseRef: string | null;
  mergeBaseSha: string | null;
}
