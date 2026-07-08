const NO_LOOSE_STRING_VALUES = {
  currentSession: "current-session",
  session: "session",
  wholeBranch: "whole-branch",
  branch: "branch",
  none: "none",
} as const;

/* Resolve the active diff mode+style for a viewer path. The DiffModeToggle
   writes `current-session`/`whole-branch`/`none`; the wire `mode` for the git
   endpoints is `session`/`branch`. */

import { useStore, DEFAULT_FILE_VIEWER_DIFF } from "../../../state/store.js";
import type {
  FileViewerDiffMode,
  FileViewerDiffStyle,
} from "../../../state/store.js";
import type { GitDiffMode } from "@f-mark/shared";

export interface ResolvedDiffState {
  mode: FileViewerDiffMode;
  style: FileViewerDiffStyle;
  baseRef: string | null;
  /** Wire mode for git endpoints; null when diff is off. */
  wireMode: GitDiffMode | null;
  /** True when a diff should be shown (mode !== "none"). */
  active: boolean;
}

function diffWireMode(mode: FileViewerDiffMode): GitDiffMode | null {
  if (mode === NO_LOOSE_STRING_VALUES.currentSession) return NO_LOOSE_STRING_VALUES.session;
  if (mode === NO_LOOSE_STRING_VALUES.wholeBranch) return NO_LOOSE_STRING_VALUES.branch;
  return null;
}

/** Read the per-tab diff state for `absPath` under `sessionKey` (defaults to
    the current session). */
export function useDiffState(
  absPath: string,
  sessionKey?: string,
): ResolvedDiffState {
  const state = useStore((s) => {
    const key = sessionKey ?? s.currentSessionId;
    if (key === null) return DEFAULT_FILE_VIEWER_DIFF;
    return s.fileViewerDiffBySession[key]?.[absPath] ?? DEFAULT_FILE_VIEWER_DIFF;
  });
  const wireMode = diffWireMode(state.mode);
  return {
    mode: state.mode,
    style: state.style,
    baseRef: state.baseRef,
    wireMode,
    active: state.mode !== NO_LOOSE_STRING_VALUES.none,
  };
}
