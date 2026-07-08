import { HunkActionsBar } from "../HunkActionsBar.js";
import type { ActionStripCommonProps } from "./types.js";

export function MonacoHunkActionStrips({
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
  if (diff.hunks.length === 0) return null;

  return (
    <div className="fv-monaco-hunks" data-testid="fv-monaco-hunks">
      {diff.hunks.map((hunk) => (
        <div className="fv-monaco-hunk-row" key={hunk.id}>
          <span className="fv-hunk-header-text">{hunk.header}</span>
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
        </div>
      ))}
    </div>
  );
}
