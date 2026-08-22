const NO_LOOSE_STRING_VALUES = {
  modified: "modified",
} as const;

/* Monaco DiffEditor view for text files in diff mode (design §8.3). Fed by
   GET /git/file-version (base + working text). Inline vs side-by-side comes
   from the per-tab diff style, with file/hunk actions rendered above Monaco. */

import { useRef } from "react";
import { FvLoading } from "../FileViewerLoading.js";
import { extOf, monacoLanguage } from "../renderers/pickRenderer.js";
import { useMonacoThemeMode } from "../renderers/monaco/theme.js";
import { actionsForStatus } from "@f-mark/shared";
import type {
  DiffBase,
  GitDiffMode,
  GitDiffResponse,
} from "@f-mark/shared";
import type { FileViewerDiffStyle } from "../../../state/store.js";
import { wireModeToDiffBase } from "./diffBase.js";
import { MonacoDiffActionStrips } from "./monacoDiffRenderer/MonacoDiffActionStrips.js";
import {
  MonacoDiffEditor,
  type MonacoDiffEditorHandle,
} from "./monacoDiffRenderer/MonacoDiffEditor.js";
import {
  getMonacoDiffUnavailableView,
  MonacoDiffError,
  MonacoDiffTruncatedNotice,
} from "./monacoDiffRenderer/MonacoDiffStatusViews.js";
import { useMonacoDiffVersion } from "./monacoDiffRenderer/useMonacoDiffVersion.js";

export interface MonacoDiffRendererProps {
  path: string;
  /** Server diff (hunks/status/actions) resolved by the FileViewer. Monaco's
      DiffEditor has no native per-hunk buttons, so these drive the actions
      strip beside it. */
  diff: GitDiffResponse;
  wireMode: GitDiffMode;
  style: FileViewerDiffStyle;
  baseRef: string | null;
  sessionId: string | null;
  /** Bumped on revert — re-pulls the editor's base/working text in lockstep
      with the shared diff re-fetch. */
  refreshKey: number;
  /** Called after a successful revert so the shared diff re-fetches. */
  onReverted: () => void;
}

export function MonacoDiffRenderer({
  path,
  diff,
  wireMode,
  style,
  baseRef,
  sessionId,
  refreshKey,
  onReverted,
}: MonacoDiffRendererProps): JSX.Element {
  const theme = useMonacoThemeMode();
  const editorRef = useRef<MonacoDiffEditorHandle>(null);
  const { version, error, scoped } = useMonacoDiffVersion({
    path,
    wireMode,
    baseRef,
    sessionId,
    refreshKey,
  });

  if (error !== null) {
    return <MonacoDiffError error={error} />;
  }
  if (version === null) {
    return <FvLoading />;
  }
  const unavailable = getMonacoDiffUnavailableView(version);
  if (unavailable !== null) {
    return unavailable;
  }

  const language = monacoLanguage(extOf(path));
  const fileStatus = diff.file_status ?? version.file_status ?? NO_LOOSE_STRING_VALUES.modified;
  const actions = diff.actions ?? actionsForStatus(fileStatus);
  const diffBase: DiffBase = wireModeToDiffBase(wireMode);

  return (
    <div className="fv-monaco-wrap">
      <MonacoDiffTruncatedNotice truncated={version.truncated} />
      {scoped !== null ? (
        <MonacoDiffActionStrips
          path={path}
          relPath={scoped.relPath}
          scope={scoped.scope}
          diff={diff}
          wireMode={wireMode}
          baseRef={baseRef}
          diffBase={diffBase}
          fileStatus={fileStatus}
          actions={actions}
          sessionId={sessionId}
          onReverted={onReverted}
          onBeforeRevert={() => editorRef.current?.clearModel()}
        />
      ) : null}
      <MonacoDiffEditor
        ref={editorRef}
        language={language}
        baseText={version.baseText}
        workingText={version.workingText}
        theme={theme}
        style={style}
      />
    </div>
  );
}
