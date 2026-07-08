const NO_LOOSE_STRING_VALUES = {
  modified: "modified",
  sideBySide: "side-by-side",
} as const;

/* Line-diff renderer for markdown / csv in diff mode (design §8.3). Fed the
   server hunks resolved once by the FileViewer's useDiffOutcome — NOT a
   client-side naive diff, and no longer self-fetching. Reuses the global
   `.diff-*` CSS (agent-components.css). Inline or side-by-side per the per-tab
   style. Only mounted when there ARE changes (the "no diff" / not-git /
   loading states are handled upstream in the FileViewer). */

import { useScopedFile } from "../fileScope.js";
import { actionsForStatus } from "@f-mark/shared";
import type { GitHunk } from "@f-mark/shared";
import { wireModeToDiffBase } from "./diffBase.js";
import {
  LineDiffFileActionStrip,
  LineDiffHunkActionBar,
} from "./lineDiffRenderer/LineDiffActionStrips.js";
import {
  InlineLineDiffHunks,
  SplitLineDiffHunks,
} from "./lineDiffRenderer/LineDiffHunks.js";
import type {
  LineDiffActionContext,
  LineDiffRendererProps,
} from "./lineDiffRenderer/types.js";

export type { LineDiffRendererProps } from "./lineDiffRenderer/types.js";

export function LineDiffRenderer({
  path,
  diff,
  wireMode,
  style,
  baseRef = null,
  sessionId,
  onReverted,
}: LineDiffRendererProps): JSX.Element {
  const scoped = useScopedFile(path);

  if (scoped === null) {
    return <div className="fv-error">file is outside the project root</div>;
  }
  if (diff.status === "binary" || diff.binary) {
    return <div className="fv-empty"><p>Binary file — no text diff.</p></div>;
  }

  /* Action bars attach to SERVER hunks (§9.2). The status/actions come from the
     server response; fall back to the matrix when actions is absent (older
     responses). */
  const fileStatus = diff.file_status ?? NO_LOOSE_STRING_VALUES.modified;
  const actions = diff.actions ?? actionsForStatus(fileStatus);
  const diffBase = wireModeToDiffBase(wireMode);
  const oldPathProp =
    diff.old_path !== undefined ? { oldPath: diff.old_path } : {};
  const actionContext: LineDiffActionContext = {
    path,
    relPath: scoped.relPath,
    scope: scoped.scope,
    wireMode,
    baseRef,
    diffBase,
    fileStatus,
    actions,
    oldPathProp,
    sessionId,
    onReverted,
  };

  /* FILE-LEVEL action strip (should-fix 6): Restore/Delete file + Undo rename,
     rendered ONCE at the diff header whenever the file status permits a
     whole-file or rename action — INDEPENDENT of whether there are hunks. This
     is what makes "Undo rename" reachable for a pure rename (0 hunks) and keeps
     "Restore file"/"Delete file" reachable for a file that also has hunks
     (per-hunk bars suppress those via `hideFileAction`). */
  const fileStrip = (
    <LineDiffFileActionStrip
      {...actionContext}
      oldPath={diff.old_path}
    />
  );

  /* Metadata-only rename (a change, so we're mounted, but 0 textual hunks):
     show the file-level strip so its actions stay reachable. */
  if (diff.hunks.length === 0) {
    return (
      <div className="fv-line-diff" data-testid="fv-line-diff-inline">
        {fileStrip}
        <div className="fv-empty fv-empty-inline">
          <p>No textual changes in this file for the selected diff mode.</p>
        </div>
      </div>
    );
  }

  /* A shared HunkActionsBar per hunk — Comment + Revert/Restore hunk only
     (file + rename live on the strip above, so `hideFileAction`). */
  const actionBar = (hunk: GitHunk): JSX.Element => (
    <LineDiffHunkActionBar
      {...actionContext}
      hunk={hunk}
    />
  );

  if (style === NO_LOOSE_STRING_VALUES.sideBySide) {
    return (
      <div className="fv-line-diff" data-testid="fv-line-diff-split">
        {fileStrip}
        <SplitLineDiffHunks
          hunks={diff.hunks}
          renderActionBar={actionBar}
        />
      </div>
    );
  }

  return (
    <div className="fv-line-diff" data-testid="fv-line-diff-inline">
      {fileStrip}
      <InlineLineDiffHunks
        hunks={diff.hunks}
        renderActionBar={actionBar}
      />
    </div>
  );
}
