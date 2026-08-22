import { MonacoFileActionStrip } from "./MonacoFileActionStrip.js";
import { MonacoHunkActionStrips } from "./MonacoHunkActionStrips.js";
import type { MonacoDiffActionStripsProps } from "./types.js";

export function MonacoDiffActionStrips({
  path,
  relPath,
  scope,
  diff,
  wireMode,
  baseRef,
  diffBase,
  fileStatus,
  actions,
  sessionId,
  onReverted,
  onBeforeRevert,
}: MonacoDiffActionStripsProps): JSX.Element {
  const oldPathProp =
    diff.old_path !== undefined ? { oldPath: diff.old_path } : {};

  return (
    <>
      <MonacoFileActionStrip
        path={path}
        relPath={relPath}
        scope={scope}
        diff={diff}
        wireMode={wireMode}
        baseRef={baseRef}
        diffBase={diffBase}
        fileStatus={fileStatus}
        actions={actions}
        oldPathProp={oldPathProp}
        sessionId={sessionId}
        onReverted={onReverted}
        onBeforeRevert={onBeforeRevert}
      />
      <MonacoHunkActionStrips
        path={path}
        relPath={relPath}
        scope={scope}
        diff={diff}
        wireMode={wireMode}
        baseRef={baseRef}
        diffBase={diffBase}
        fileStatus={fileStatus}
        actions={actions}
        oldPathProp={oldPathProp}
        sessionId={sessionId}
        onReverted={onReverted}
        onBeforeRevert={onBeforeRevert}
      />
    </>
  );
}
