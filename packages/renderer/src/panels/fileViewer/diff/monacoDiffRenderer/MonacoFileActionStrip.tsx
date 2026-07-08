import { HunkActionsBar } from "../HunkActionsBar.js";
import type { ActionStripCommonProps } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  renamed: "renamed",
  binaryRenamed: "binary-renamed",
  file: "File",
} as const;

export function MonacoFileActionStrip({
  path,
  relPath,
  scope,
  diff,
  wireMode,
  baseRef,
  diffBase,
  fileStatus,
  actions,
  oldPathProp,
  sessionId,
  onReverted,
}: ActionStripCommonProps): JSX.Element | null {
  if (!actions.file && !actions.rename) return null;

  return (
    <div className="fv-file-actions" data-testid="fv-file-actions">
      <span className="fv-hunk-header-text">
        {diff.old_path !== undefined &&
        (fileStatus === NO_LOOSE_STRING_VALUES.renamed || fileStatus === NO_LOOSE_STRING_VALUES.binaryRenamed)
          ? `Renamed from ${diff.old_path}`
          : NO_LOOSE_STRING_VALUES.file}
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
