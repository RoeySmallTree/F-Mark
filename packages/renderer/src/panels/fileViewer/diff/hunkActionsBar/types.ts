import type { CSSProperties } from "react";
import type {
  DiffBase,
  GitDiffMode,
  GitFileActions,
  GitFileStatus,
  GitHunk,
  GitRevertAction,
  ProseMention,
} from "@f-mark/shared";
import type { RootScope } from "../../../../api/client.js";

export type LineRange = [number, number];

export interface HunkActionsBarProps {
  /** Absolute viewer path (UI identifier) - converted to root-relative by the
      poster / passed through to the revert client. */
  absPath: string;
  /** Root-relative path used for the revert call. */
  relPath: string;
  /** Wire scope for the revert call. */
  scope: RootScope;
  /** Active wire mode (session/branch). */
  wireMode: GitDiffMode;
  /** Explicit compare base ref, null means the project default. */
  baseRef?: string | null;
  /** The diff base label stored on the comment (`current-session`/
      `whole-branch`). */
  diffBase: DiffBase;
  /** The file's git status (drives label + which file action runs). */
  fileStatus: GitFileStatus;
  /** Server-computed action availability (the X3 matrix). */
  actions: GitFileActions;
  /** The hunk this bar targets - omitted for a pure file-level bar (binary). */
  hunk?: GitHunk;
  /** Source path for a rename revert (root-relative OLD path). */
  oldPath?: string;
  sessionId: string | null;
  /** Called after a successful revert so the renderer re-fetches the diff. */
  onReverted(): void;
  /** Positioning within the renderer (the comment popover anchors here). */
  style?: CSSProperties;
  /** Render only the file-level action(s) - Restore/Delete file + Undo rename,
      no per-hunk Comment/Revert. Used by the binary/media file-level bar AND
      the always-present FILE-LEVEL strip at a text diff's header (should-fix 6).
      Independent of whether the file has hunks. */
  fileLevelOnly?: boolean;
  /** Suppress the file-level + rename actions on a PER-HUNK bar so they aren't
      duplicated by a separate file-level strip rendered at the diff header
      (should-fix 6). The per-hunk bar then shows only Comment + Revert hunk. */
  hideFileAction?: boolean;
}

export interface HunkActionsBarController {
  busy: boolean;
  canPost: boolean;
  conflict: string | null;
  defaultMentions: ProseMention[];
  draftOpen: boolean;
  fileTitle: string;
  lines: LineRange;
  posterBusy: boolean;
  snippet: string;
  closeDraft(): void;
  runRevert(action: GitRevertAction): Promise<void>;
  submitComment(content: string, mentions: ProseMention[]): Promise<void>;
  toggleDraft(): void;
}
