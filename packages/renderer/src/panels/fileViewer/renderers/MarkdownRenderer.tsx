import { lazy, Suspense, useCallback, useRef } from "react";
import type { OnMount } from "@monaco-editor/react";
import { MarkdownRenderer as RenderMarkdown } from "../../../render/MarkdownRenderer.js";
import { RenderedLineCommentRail } from "../lineComment/RenderedLineCommentRail.js";
import { FvLoading } from "../FileViewerLoading.js";
import { FileEditBar } from "./FileEditBar.js";
import { MarkdownViewModeToggle } from "./MarkdownViewModeToggle.js";
import { extOf, monacoLanguage } from "./pickRenderer.js";
import {
  monacoEditorTheme,
  useMonacoThemeMode,
} from "./monaco/theme.js";
import { useMonacoFileText } from "./monaco/useMonacoFileText.js";
import { useFileAutosave } from "../useFileAutosave.js";
import { useMarkdownViewMode } from "../useMarkdownViewMode.js";

const NO_LOOSE_STRING_VALUES = {
  on: "on",
  none: "none",
  preview: "preview",
  interactive: "interactive",
  source: "source",
  rendered: "rendered",
  accordion: "accordion",
} as const;

const Editor = lazy(async () => {
  const mod = await import("@monaco-editor/react");
  return { default: mod.default };
});

export interface MarkdownRendererProps {
  path: string;
}

export function MarkdownRenderer({
  path,
}: MarkdownRendererProps): JSX.Element {
  const [autosave, setAutosave] = useFileAutosave();
  const [viewMode, setViewMode] = useMarkdownViewMode();
  const file = useMonacoFileText(path, { autosave });
  const { text, error, truncated } = file;
  const theme = useMonacoThemeMode();
  const saveRef = useRef(file.save);
  saveRef.current = file.save;
  const onMount = useCallback<OnMount>((editor, monaco) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      void saveRef.current();
    });
  }, []);

  if (error !== null) {
    return (
      <div className="fv-error">failed to load markdown: {error}</div>
    );
  }
  if (text === null) {
    return <FvLoading />;
  }

  const renderMode =
    viewMode === NO_LOOSE_STRING_VALUES.interactive
      ? NO_LOOSE_STRING_VALUES.accordion
      : NO_LOOSE_STRING_VALUES.rendered;
  const showEditor =
    viewMode !== NO_LOOSE_STRING_VALUES.preview &&
    viewMode !== NO_LOOSE_STRING_VALUES.interactive;
  const showPreview = viewMode !== NO_LOOSE_STRING_VALUES.source;

  return (
    <div className="fv-markdown-wrap">
      <FileEditBar
        path={path}
        dirty={file.dirty}
        saving={file.saving}
        saveError={file.saveError}
        savedAt={file.savedAt}
        truncated={truncated}
        saveLabel="Save markdown file"
        autosave={autosave}
        onAutosaveChange={setAutosave}
        onSave={() => void file.save()}
        extraControls={
          <MarkdownViewModeToggle mode={viewMode} onModeChange={setViewMode} />
        }
      />
      {truncated ? (
        <div className="fv-loading">
          file truncated to first 8 MB, editing is disabled for this preview
        </div>
      ) : null}
      <div className={`fv-markdown-surface fv-markdown-surface--${viewMode}`}>
        {showEditor ? (
          <section className="fv-markdown-editor-pane" aria-label="Markdown editor">
            <Suspense fallback={<FvLoading />}>
              <Editor
                height="100%"
                width="100%"
                path={path}
                language={monacoLanguage(extOf(path))}
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
                }}
              />
            </Suspense>
          </section>
        ) : null}
        {showPreview ? (
          <section className="fv-markdown-preview-pane" aria-label="Markdown preview">
            <RenderedLineCommentRail path={path} sourceText={text}>
              <RenderMarkdown
                content={text}
                mode={renderMode}
                className="fv-markdown-doc"
              />
            </RenderedLineCommentRail>
          </section>
        ) : null}
      </div>
    </div>
  );
}
