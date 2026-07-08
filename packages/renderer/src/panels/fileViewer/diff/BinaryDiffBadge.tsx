const NO_LOOSE_STRING_VALUES = {
  changed: "Changed",
  added: "added",
  untracked: "untracked",
  added2: "Added",
  deleted: "deleted",
  deleted2: "Deleted",
  renamed: "renamed",
  renamed2: "Renamed",
} as const;

/* Office / unknown-binary diff view (design §8.3 / X3): no diff body — a
   "changed" badge plus the file status and a file-level revert. Fed the server
   diff resolved once by the FileViewer (useDiffOutcome); only mounted when
   there ARE changes. */

import { FileWarning } from "lucide-react";
import { useScopedFile } from "../fileScope.js";
import { basenameOf } from "../renderers/pickRenderer.js";
import { actionsForStatus } from "@f-mark/shared";
import type { DiffBase, GitDiffMode, GitDiffResponse } from "@f-mark/shared";
import { HunkActionsBar } from "./HunkActionsBar.js";
import { wireModeToDiffBase } from "./diffBase.js";

export interface BinaryDiffBadgeProps {
  path: string;
  /** Server diff resolved by the FileViewer (useDiffOutcome). */
  diff: GitDiffResponse;
  wireMode: GitDiffMode;
  baseRef: string | null;
  sessionId: string | null;
  /** Called after a successful revert so the shared diff re-fetches. */
  onReverted: () => void;
}

function statusLabel(status: string | undefined): string {
  if (status === undefined) return NO_LOOSE_STRING_VALUES.changed;
  if (status.includes(NO_LOOSE_STRING_VALUES.added) || status === NO_LOOSE_STRING_VALUES.untracked) return NO_LOOSE_STRING_VALUES.added2;
  if (status.includes(NO_LOOSE_STRING_VALUES.deleted)) return NO_LOOSE_STRING_VALUES.deleted2;
  if (status.includes(NO_LOOSE_STRING_VALUES.renamed)) return NO_LOOSE_STRING_VALUES.renamed2;
  return NO_LOOSE_STRING_VALUES.changed;
}

export function BinaryDiffBadge({
  path,
  diff,
  wireMode,
  baseRef,
  sessionId,
  onReverted,
}: BinaryDiffBadgeProps): JSX.Element {
  const scoped = useScopedFile(path);

  /* Binary → file-level revert only (X3). Render a "Restore file" / "Delete
     file" action when we have the status + scope. */
  const fileStatus = diff.file_status ?? null;
  const actions = fileStatus !== null ? (diff.actions ?? actionsForStatus(fileStatus)) : null;
  const diffBase: DiffBase = wireModeToDiffBase(wireMode);

  return (
    <div className="fv-binary-diff" data-testid="fv-binary-diff">
      <FileWarning size={28} aria-hidden className="fv-binary-diff-icon" />
      <div className="fv-binary-diff-name">{basenameOf(path)}</div>
      <div className="fv-binary-diff-badge">{statusLabel(diff.file_status)}</div>
      <p className="fv-empty-hint">
        Binary file — no inline diff. The file content differs from the base.
      </p>
      {scoped !== null && fileStatus !== null && actions !== null && (actions.file || actions.rename) ? (
        <HunkActionsBar
          absPath={path}
          relPath={scoped.relPath}
          scope={scoped.scope}
          wireMode={wireMode}
          baseRef={baseRef}
          diffBase={diffBase}
          fileStatus={fileStatus}
          actions={actions}
          {...(diff.old_path !== undefined ? { oldPath: diff.old_path } : {})}
          sessionId={sessionId}
          onReverted={onReverted}
          fileLevelOnly
        />
      ) : null}
    </div>
  );
}
