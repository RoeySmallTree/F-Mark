import type { GitHunk } from "@f-mark/shared";
import { HunkActionsBar } from "../HunkActionsBar.js";
import { fileStatusLabel } from "./model.js";
import type { LineDiffActionContext } from "./types.js";

interface LineDiffFileActionStripProps extends LineDiffActionContext {
  oldPath: string | undefined;
}

export function LineDiffFileActionStrip({
  path,
  relPath,
  scope,
  wireMode,
  baseRef,
  diffBase,
  fileStatus,
  actions,
  oldPath,
  oldPathProp,
  sessionId,
  onReverted,
}: LineDiffFileActionStripProps): JSX.Element | null {
  if (!actions.file && !actions.rename) return null;

  return (
    <div className="fv-file-actions" data-testid="fv-file-actions">
      <span className="fv-hunk-header-text">
        {fileStatusLabel(fileStatus, oldPath)}
      </span>
      <HunkActionsBar
        absPath={path}
        relPath={relPath}
        scope={scope}
        wireMode={wireMode}
        baseRef={baseRef}
        diffBase={diffBase}
        fileStatus={fileStatus}
        actions={actions}
        {...oldPathProp}
        sessionId={sessionId}
        onReverted={onReverted}
        fileLevelOnly
      />
    </div>
  );
}

interface LineDiffHunkActionBarProps extends LineDiffActionContext {
  hunk: GitHunk;
}

export function LineDiffHunkActionBar({
  path,
  relPath,
  scope,
  wireMode,
  baseRef,
  diffBase,
  fileStatus,
  actions,
  oldPathProp,
  hunk,
  sessionId,
  onReverted,
}: LineDiffHunkActionBarProps): JSX.Element {
  return (
    <HunkActionsBar
      absPath={path}
      relPath={relPath}
      scope={scope}
      wireMode={wireMode}
      baseRef={baseRef}
      diffBase={diffBase}
      fileStatus={fileStatus}
      actions={actions}
      hunk={hunk}
      {...oldPathProp}
      sessionId={sessionId}
      onReverted={onReverted}
      hideFileAction
    />
  );
}
