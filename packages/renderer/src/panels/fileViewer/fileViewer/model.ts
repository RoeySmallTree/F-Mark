import type { GitDiffMode, GitDiffResponse } from "@f-mark/shared";
import type { DiffOutcome } from "../diff/useDiffOutcome.js";
import type { ResolvedDiffState } from "../diff/useDiffState.js";
import type { RendererKind } from "../renderers/pickRenderer.js";
import type { FileViewerDiffStyle } from "../../../state/store.js";

const NO_LOOSE_STRING_VALUES = {
  monaco: "monaco",
  json: "json",
  markdown: "markdown",
  csv: "csv",
  changes: "changes",
  noDiff: "no-diff",
} as const;

export interface RenderableDiff {
  diff: GitDiffResponse;
  wireMode: GitDiffMode;
  style: FileViewerDiffStyle;
  baseRef: string | null;
  refreshKey: number;
  onReverted: () => void;
}

export interface FileViewerModel {
  active: string | null;
  kind: RendererKind | null;
  sessionId: string | null;
  diffState: ResolvedDiffState;
  outcome: DiffOutcome;
  notGit: boolean;
  isTextKind: boolean;
  openModal: () => void;
}

export function isTextRendererKind(kind: RendererKind | null): boolean {
  return (
    kind === NO_LOOSE_STRING_VALUES.monaco ||
    kind === NO_LOOSE_STRING_VALUES.json ||
    kind === NO_LOOSE_STRING_VALUES.markdown ||
    kind === NO_LOOSE_STRING_VALUES.csv
  );
}

export function getRenderableDiff(
  diffState: ResolvedDiffState,
  outcome: DiffOutcome,
): RenderableDiff | null {
  if (
    !diffState.active ||
    diffState.wireMode === null ||
    outcome.phase !== NO_LOOSE_STRING_VALUES.changes ||
    outcome.diff === null
  ) {
    return null;
  }

  return {
    diff: outcome.diff,
    wireMode: diffState.wireMode,
    style: diffState.style,
    baseRef: diffState.baseRef,
    refreshKey: outcome.refreshKey,
    onReverted: outcome.refresh,
  };
}

export function shouldShowNoDiffChip(
  diffState: ResolvedDiffState,
  outcome: DiffOutcome,
  notGit: boolean,
): boolean {
  return diffState.active && !notGit && outcome.phase === NO_LOOSE_STRING_VALUES.noDiff;
}

export function shouldShowDiffStyleToggle(
  diffState: ResolvedDiffState,
  outcome: DiffOutcome,
  notGit: boolean,
  isTextKind: boolean,
): boolean {
  return (
    diffState.active &&
    !notGit &&
    isTextKind &&
    outcome.phase === NO_LOOSE_STRING_VALUES.changes
  );
}
