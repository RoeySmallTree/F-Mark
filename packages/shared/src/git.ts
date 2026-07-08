/* Shared DTOs for the read-only git diff feature (design §8 / X3 / X5 / X6).
   The kernel git service is authoritative for diff bytes and hunks; these
   types are the wire contract between `routes/git.ts` and the renderer. */

/** Diff scoping mode. `branch` (a.k.a. "whole-branch") diffs merge-base →
    working tree over every changed file; `session` (a.k.a. "current-session")
    filters that set to files this session's tool-use events touched. */
export type GitDiffMode = "branch" | "session";

export const GIT_DIFF_MODES = {
  branch: "branch",
  session: "session",
} as const satisfies Record<string, GitDiffMode>;

export const GIT_RESPONSE_STATUSES = {
  ok: "ok",
  notGit: "not-git",
  baseNotFound: "base-not-found",
  binary: "binary",
  noChange: "no-change",
  notFound: "not-found",
} as const;

/** Per-file change status. `binary-*` mirrors the text variants but carries no
    text hunks — the UI offers a file-level action only (X3). `untracked` files
    are NOT reported by `git diff`; the changed-files endpoint unions them in
    via `git ls-files --others --exclude-standard`. */
export type GitFileStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "untracked"
  | "binary-added"
  | "binary-modified"
  | "binary-deleted"
  | "binary-renamed"
  | "binary-untracked";

export const GIT_FILE_STATUSES = {
  added: "added",
  modified: "modified",
  deleted: "deleted",
  renamed: "renamed",
  untracked: "untracked",
  binaryAdded: "binary-added",
  binaryModified: "binary-modified",
  binaryDeleted: "binary-deleted",
  binaryRenamed: "binary-renamed",
  binaryUntracked: "binary-untracked",
} as const satisfies Record<string, GitFileStatus>;

/** One of the three revert operations a hunk/file can offer (X3). `hunk`
    reverse-applies a single server hunk; `file` reverts the whole file
    (restore / delete / rm depending on status); `rename` moves a renamed
    file back to its old path. */
export type GitRevertAction = "hunk" | "file" | "rename";

/** Which revert actions are valid for a file's status (the X3 matrix). The
    UI shows only these — binary/deleted label the file action "Restore file",
    and renames expose `rename`. Computed server-side via `actionsForStatus`
    and echoed on the changed-file + diff responses so the client never has to
    re-derive the matrix. */
export interface GitFileActions {
  /** Per-hunk reverse-apply is offered (text statuses with real hunks). */
  hunk: boolean;
  /** A whole-file revert is offered (restore-from-base, rm, or rm --cached). */
  file: boolean;
  /** A rename-back action is offered (renamed statuses, needs old+new path). */
  rename: boolean;
}

/** The full X3 status → action-availability matrix. Single source of truth
    shared by the kernel revert route (to gate which actions it will run) and
    the renderer (to render only valid affordances and the right labels).

    - text modified / deleted / renamed-with-content → hunk + file (+ rename).
    - untracked / added → hunk (reverse-apply synthetic) + file (delete).
    - renamed-no-content (no text hunk) → rename + file only.
    - every binary-* → file only (+ rename for binary renames). */
export function actionsForStatus(status: GitFileStatus): GitFileActions {
  switch (status) {
    case "modified":
      return { hunk: true, file: true, rename: false };
    case "added":
    case "untracked":
      return { hunk: true, file: true, rename: false };
    case "deleted":
      return { hunk: true, file: true, rename: false };
    case "renamed":
      /* Rename may carry content hunks (hunk reverse-apply) OR be metadata-only
         (no hunk). The route tolerates a `hunk` action with zero hunks by
         falling back to no-op; the renderer only shows per-hunk buttons when
         hunks exist, and always shows rename + file. */
      return { hunk: true, file: true, rename: true };
    case "binary-added":
    case "binary-untracked":
    case "binary-modified":
    case "binary-deleted":
      return { hunk: false, file: true, rename: false };
    case "binary-renamed":
      return { hunk: false, file: true, rename: true };
    default:
      return { hunk: false, file: false, rename: false };
  }
}

export interface GitChangedFile {
  /** Project-root-relative path (POSIX separators). For renames this is the
      NEW path; `old_path` carries the source. */
  rel_path: string;
  status: GitFileStatus;
  /** Source path for a rename (root-relative). */
  old_path?: string;
  additions: number;
  deletions: number;
  binary: boolean;
  /** Which revert actions this file's status permits (X3). */
  actions: GitFileActions;
}

export interface GitChangedFilesResponse {
  /** Overall repo state. `not-git` and `base-not-found` mean the file list is
      empty and the UI disables branch/session modes. */
  status: "ok" | "not-git" | "base-not-found";
  /** The canonical path_id of the resolved root scope, so a caller that
      requested by raw `root` can key its badge cache by path_id (X6). */
  path_id: string;
  base_ref: string | null;
  merge_base_sha: string | null;
  files: GitChangedFile[];
  error?: string | null;
}

/** Where a hunk lives, so revert knows what to reverse-apply against (X3).
    `worktree` hunks come from the unstaged diff (index → working tree) and
    reverse-apply to the worktree; `index` hunks come from the cached diff
    (base → index) and reverse-apply with `git apply --reverse --cached` so an
    `MM` file's staged-hunk revert never clobbers the unstaged worktree edit.
    OPTIONAL/additive: a client that doesn't read it treats every hunk as a
    plain worktree hunk (the historical behavior). */
export type GitHunkOrigin = "worktree" | "index";

export interface GitHunk {
  /** Stable id for this hunk within the file diff. Worktree hunks are
      `H{index}` (unchanged for back-compat); index hunks are `I{index}` so the
      two origin streams never collide when both are present on an `MM` file. */
  id: string;
  /** The `@@ -a,b +c,d @@` header line (with any trailing section text). */
  header: string;
  old_start: number;
  old_lines: number;
  new_start: number;
  new_lines: number;
  /** The hunk body (the lines after the header, each prefixed with ` `/`+`/`-`). */
  patch: string;
  /** Apply target (X3). Absent ⇒ treat as `worktree`. The kernel always sets
      it; the field is optional so the renderer that doesn't read it still
      typechecks against this shared type. */
  origin?: GitHunkOrigin;
}

export interface GitDiffResponse {
  status:
    | "ok"
    | "not-git"
    | "base-not-found"
    | "binary"
    | "no-change"
    | "not-found";
  rel_path: string;
  old_path?: string;
  file_status?: GitFileStatus;
  binary: boolean;
  hunks: GitHunk[];
  /** Which revert actions this file's status permits (X3). Absent only on the
      terminal not-git/base-not-found shapes where there is nothing to revert. */
  actions?: GitFileActions;
  base_ref: string | null;
  merge_base_sha: string | null;
  error?: string | null;
}

export interface GitFileVersionResponse {
  status: "ok" | "not-git" | "base-not-found" | "binary" | "not-found";
  /** Base-side text (`git show <merge-base>:<rel_path>`); empty for
      added/untracked files. */
  baseText: string;
  /** Working-tree text; empty for deleted files. */
  workingText: string;
  /** The per-file status so the UI can label deleted/added/etc. */
  file_status: GitFileStatus | null;
  /** True when either side exceeded the read cap and was truncated. */
  truncated: boolean;
  binary: boolean;
  base_ref: string | null;
  merge_base_sha: string | null;
  error?: string | null;
}

export interface GitDiffSettingsResponse {
  path_id: string;
  root: string;
  diff_base_ref_override: string | null;
  detected_base_ref: string | null;
  effective_base_ref: string | null;
  merge_base_sha: string | null;
  status: "ok" | "not-git" | "base-not-found";
  error: string | null;
}

export interface GitBranchRefsResponse {
  status: "ok" | "not-git";
  path_id: string;
  root: string;
  current_ref: string | null;
  detected_base_ref: string | null;
  refs: string[];
  error?: string | null;
}

export interface PutGitDiffSettingsBody {
  path_id: string;
  diff_base_ref_override: string | null;
}

/* ── hunk / file revert ───────────────────────────────────────────────── */

/** Request body for `POST /git/revert-hunk`. The server RECOMPUTES the diff
    for `(path_id, rel_path, mode, base)` and finds the hunk by `hunk_id` —
    it never trusts client-supplied patch text. `action` defaults to `"hunk"`;
    `"file"` reverts the whole file and `"rename"` moves a renamed file back
    (which needs `old_path`). */
export interface GitRevertHunkRequest {
  rel_path: string;
  mode: GitDiffMode;
  base?: string;
  /** Required for `action:"hunk"`; ignored for `file`/`rename`. */
  hunk_id?: string;
  action?: GitRevertAction;
  /** Source path for a rename revert (root-relative, the OLD path). */
  old_path?: string;
}

export interface GitRevertHunkResponse {
  status: "ok";
  /** The action that was actually performed. */
  action: GitRevertAction;
  rel_path: string;
  /** The file's status before the revert (so the UI can message precisely). */
  file_status: GitFileStatus;
}
