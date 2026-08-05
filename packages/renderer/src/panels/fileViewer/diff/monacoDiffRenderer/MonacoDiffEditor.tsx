import {
  forwardRef,
  lazy,
  Suspense,
  useImperativeHandle,
  useRef,
} from "react";
import type {
  DiffOnMount,
  MonacoDiffEditor as MonacoDiffEditorInstance,
} from "@monaco-editor/react";
import { FvLoading } from "../../FileViewerLoading.js";
import type { MonacoThemeMode } from "../../renderers/monaco/theme.js";
import { monacoEditorTheme } from "../../renderers/monaco/theme.js";
import type { FileViewerDiffStyle } from "../../../../state/store.js";

const NO_LOOSE_STRING_VALUES = {
  sideBySide: "side-by-side",
  on: "on",
  none: "none",
} as const;

const DiffEditor = lazy(async () => {
  const mod = await import("@monaco-editor/react");
  return { default: mod.DiffEditor };
});

interface MonacoDiffEditorProps {
  language: string;
  baseText: string;
  workingText: string;
  theme: MonacoThemeMode;
  style: FileViewerDiffStyle;
}

/** A revert calls clearModel() before its mutation lands, so the widget has
    no attached model when the base/working text swaps underneath it.
    Without this, every revert (file or hunk, delete or restore) fired an
    uncaught "TextModel got disposed before DiffEditorWidget model got
    reset" once the refreshed text replaced the still-attached one (M16a). */
export interface MonacoDiffEditorHandle {
  clearModel(): void;
}

export const MonacoDiffEditor = forwardRef<
  MonacoDiffEditorHandle,
  MonacoDiffEditorProps
>(function MonacoDiffEditor(
  { language, baseText, workingText, theme, style },
  ref,
) {
  const editorRef = useRef<MonacoDiffEditorInstance | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      clearModel: () => {
        editorRef.current?.setModel(null);
      },
    }),
    [],
  );

  const onMount: DiffOnMount = (editor) => {
    editorRef.current = editor;
  };

  return (
    <Suspense fallback={<FvLoading />}>
      <DiffEditor
        height="100%"
        width="100%"
        language={language}
        original={baseText}
        modified={workingText}
        theme={monacoEditorTheme(theme)}
        onMount={onMount}
        options={{
          readOnly: true,
          renderSideBySide: style === NO_LOOSE_STRING_VALUES.sideBySide,
          minimap: { enabled: false },
          fontSize: 12,
          wordWrap: NO_LOOSE_STRING_VALUES.on,
          scrollBeyondLastLine: false,
          renderLineHighlight: NO_LOOSE_STRING_VALUES.none,
          automaticLayout: true,
          renderOverviewRuler: false,
        }}
      />
    </Suspense>
  );
});
