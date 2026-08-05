import { lazy, Suspense, useCallback, useMemo, useRef, type JSX } from "react";
import type { OnMount } from "@monaco-editor/react";
import { FvLoading } from "../FileViewerLoading.js";
import { FileEditBar } from "./FileEditBar.js";
import { extOf, monacoLanguage } from "./pickRenderer.js";
import { MonacoCommentOverlay } from "./monaco/MonacoCommentOverlay.js";
import { MonacoLineCommentDraft } from "./monaco/MonacoLineCommentDraft.js";
import {
  monacoEditorTheme,
  useMonacoThemeMode,
} from "./monaco/theme.js";
import { useMonacoCommentedLines } from "./monaco/useMonacoCommentedLines.js";
import { useMonacoCommentDraft } from "./monaco/useMonacoCommentDraft.js";
import { useMonacoEditorInteractions } from "./monaco/useMonacoEditorInteractions.js";
import { useMonacoEditorRefs } from "./monaco/useMonacoEditorRefs.js";
import { useMonacoFileText } from "./monaco/useMonacoFileText.js";
import { useMonacoReveal } from "./monaco/useMonacoReveal.js";
import { useFileAutosave } from "../useFileAutosave.js";
import { useScopedFile } from "../fileScope.js";
import { buildFileCommentAnchors } from "../lineComment/renderedRail/commentAnchors.js";
import { useRenderedRailStoreBindings } from "../lineComment/renderedRail/useRenderedRailStoreBindings.js";

const NO_LOOSE_STRING_VALUES = {
  on: "on",
  none: "none",
  http404: "HTTP 404",
} as const;

const Editor = lazy(async () => {
  const mod = await import("@monaco-editor/react");
  return { default: mod.default };
});

export interface MonacoRendererProps {
  path: string;
}

export function MonacoRenderer({ path }: MonacoRendererProps): JSX.Element {
  const [autosave, setAutosave] = useFileAutosave();
  const file = useMonacoFileText(path, { autosave });
  const { text, error, truncated } = file;
  const theme = useMonacoThemeMode();
  const { events, activeTarget, setCommentTarget } = useRenderedRailStoreBindings();
  const scoped = useScopedFile(path);
  const scopedPath = scoped?.relPath ?? null;
  const lineCount = Math.max(1, (text ?? "").split(/\r?\n/).length);
  const anchors = useMemo(
    () =>
      scopedPath === null
        ? []
        : buildFileCommentAnchors({ events, scopedPath, lineCount }),
    [events, scopedPath, lineCount],
  );
  const { editorRef, monacoRef, wrapRef } = useMonacoEditorRefs();
  const draft = useMonacoCommentDraft({ path, text, editorRef });
  const interactions = useMonacoEditorInteractions({
    editorRef,
    monacoRef,
    canPost: draft.canPost,
    openDraft: draft.openDraft,
    updateDraftTop: draft.updateDraftTop,
  });
  useMonacoCommentedLines({ anchors, editorRef, ready: interactions.ready });
  const reveal = useMonacoReveal({
    path,
    text,
    ready: interactions.ready,
    editorRef,
    monacoRef,
  });
  const saveRef = useRef(file.save);
  saveRef.current = file.save;
  const onMount = useCallback<OnMount>(
    (editor, monaco) => {
      interactions.onMount(editor, monaco);
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        void saveRef.current();
      });
    },
    [interactions],
  );

  if (error !== null) {
    /* Only a 404 gets the designed empty state — a revert deleting the file
       out from under a still-open tab is the common case (M16b). Any other
       error (network, permissions, 5xx) keeps the raw message: it's a real
       failure worth seeing verbatim, not an expected "file is gone" state. */
    if (error === NO_LOOSE_STRING_VALUES.http404) {
      return (
        <div className="fv-empty">
          <p>This file was deleted.</p>
          <p className="fv-empty-hint">
            It no longer exists at this path — close the tab or open another
            file.
          </p>
        </div>
      );
    }
    return <div className="fv-error">failed to load file: {error}</div>;
  }
  if (text === null) {
    return <FvLoading />;
  }

  const language = monacoLanguage(extOf(path));
  return (
    <div className="fv-monaco-wrap" ref={wrapRef}>
      <FileEditBar
        path={path}
        dirty={file.dirty}
        saving={file.saving}
        saveError={file.saveError}
        savedAt={file.savedAt}
        truncated={truncated}
        saveLabel="Save file"
        autosave={autosave}
        onAutosaveChange={setAutosave}
        onSave={() => void file.save()}
      />
      {truncated ? (
        <div className="fv-loading">
          file truncated to first 8 MB, editing is disabled for this preview
        </div>
      ) : null}
      {reveal.driftHint ? (
        <div className="fv-drift-hint" role="status" data-testid="fv-drift-hint">
          comment location drifted — showing best match
        </div>
      ) : null}
      <Suspense fallback={<FvLoading />}>
        <div className="fv-monaco-editor-frame">
          <Editor
            height="100%"
            width="100%"
            path={path}
            language={language}
            value={text}
            theme={monacoEditorTheme(theme)}
            onMount={onMount}
            onChange={(value) => file.setText(value ?? "")}
            options={{
              readOnly: truncated,
              minimap: { enabled: false },
              fontSize: 12,
              wordWrap: NO_LOOSE_STRING_VALUES.on,
              scrollBeyondLastLine: false,
              renderLineHighlight: NO_LOOSE_STRING_VALUES.none,
              automaticLayout: true,
              glyphMargin: true,
            }}
          />
          {scopedPath !== null ? (
            <MonacoCommentOverlay
              path={path}
              text={text}
              scopedPath={scopedPath}
              events={events}
              anchors={anchors}
              activeTarget={activeTarget}
              lineCount={lineCount}
              editorRef={editorRef}
              monacoRef={monacoRef}
              ready={interactions.ready}
              setCommentTarget={setCommentTarget}
            />
          ) : null}
        </div>
      </Suspense>
      <MonacoLineCommentDraft
        path={path}
        draft={draft.draft}
        snippet={draft.draftSnippet}
        busy={draft.busy}
        defaultMentions={draft.defaultMentions}
        onSubmit={(content, mentions) => void draft.submitDraft(content, mentions)}
        onClose={draft.closeDraft}
      />
    </div>
  );
}

export { normalizeSelectionLines } from "./monaco/selection.js";
