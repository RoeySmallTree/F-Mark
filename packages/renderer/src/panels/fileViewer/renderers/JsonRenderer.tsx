import { lazy, Suspense, useCallback, useMemo, useRef, type JSX } from "react";
import type { OnMount } from "@monaco-editor/react";
import { JsonRenderer as RenderJson } from "../../../render/JsonRenderer.js";
import { FvLoading } from "../FileViewerLoading.js";
import { FileEditBar } from "./FileEditBar.js";
import { JsonViewModeToggle } from "./JsonViewModeToggle.js";
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
import { useJsonViewMode } from "../useJsonViewMode.js";
import { useScopedFile } from "../fileScope.js";
import { buildFileCommentAnchors } from "../lineComment/renderedRail/commentAnchors.js";
import { useRenderedRailStoreBindings } from "../lineComment/renderedRail/useRenderedRailStoreBindings.js";

const NO_LOOSE_STRING_VALUES = {
  on: "on",
  none: "none",
  source: "source",
  tree: "tree",
} as const;

const Editor = lazy(async () => {
  const mod = await import("@monaco-editor/react");
  return { default: mod.default };
});

export interface JsonRendererProps {
  path: string;
}

interface ParsedJson {
  value: unknown;
  error: string | null;
}

function parseJson(text: string): ParsedJson {
  try {
    return { value: JSON.parse(text) as unknown, error: null };
  } catch (error) {
    return {
      value: null,
      error: error instanceof Error ? error.message : "Invalid JSON",
    };
  }
}

export function JsonRenderer({ path }: JsonRendererProps): JSX.Element {
  const [autosave, setAutosave] = useFileAutosave();
  const [viewMode, setViewMode] = useJsonViewMode();
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
  const parsed = useMemo(() => (text === null ? null : parseJson(text)), [text]);

  if (error !== null) {
    return <div className="fv-error">failed to load JSON: {error}</div>;
  }
  if (text === null) {
    return <FvLoading />;
  }

  const language = monacoLanguage(extOf(path));
  return (
    <div className="fv-monaco-wrap fv-json-wrap" ref={wrapRef}>
      <FileEditBar
        path={path}
        dirty={file.dirty}
        saving={file.saving}
        saveError={file.saveError}
        savedAt={file.savedAt}
        truncated={truncated}
        saveLabel="Save JSON file"
        autosave={autosave}
        onAutosaveChange={setAutosave}
        onSave={() => void file.save()}
        extraControls={
          <JsonViewModeToggle mode={viewMode} onModeChange={setViewMode} />
        }
      />
      {truncated ? (
        <div className="fv-loading">
          file truncated to first 8 MB, editing is disabled for this preview
        </div>
      ) : null}
      {reveal.driftHint && viewMode === NO_LOOSE_STRING_VALUES.source ? (
        <div className="fv-drift-hint" role="status" data-testid="fv-drift-hint">
          comment location drifted, showing best match
        </div>
      ) : null}
      {viewMode === NO_LOOSE_STRING_VALUES.source ? (
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
      ) : (
        <section className="fv-json-preview-pane" aria-label="Interactive JSON preview">
          {parsed?.error === null ? (
            <RenderJson value={parsed.value} mode={NO_LOOSE_STRING_VALUES.tree} />
          ) : (
            <div className="fv-json-parse-error" role="status">
              <div className="fv-render-error-title">Invalid JSON</div>
              <p className="fv-render-error-copy">
                {parsed?.error ?? "This file could not be parsed as JSON."}
              </p>
              <pre className="fm-source fv-json-error-source">
                <code>{text}</code>
              </pre>
            </div>
          )}
        </section>
      )}
      {viewMode === NO_LOOSE_STRING_VALUES.source ? (
        <MonacoLineCommentDraft
          path={path}
          draft={draft.draft}
          snippet={draft.draftSnippet}
          busy={draft.busy}
          defaultMentions={draft.defaultMentions}
          onSubmit={(content, mentions) => void draft.submitDraft(content, mentions)}
          onClose={draft.closeDraft}
        />
      ) : null}
    </div>
  );
}
