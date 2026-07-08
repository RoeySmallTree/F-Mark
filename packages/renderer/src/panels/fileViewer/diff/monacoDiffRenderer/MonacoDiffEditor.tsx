import { lazy, Suspense } from "react";
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

export function MonacoDiffEditor({
  language,
  baseText,
  workingText,
  theme,
  style,
}: MonacoDiffEditorProps): JSX.Element {
  return (
    <Suspense fallback={<FvLoading />}>
      <DiffEditor
        height="100%"
        width="100%"
        language={language}
        original={baseText}
        modified={workingText}
        theme={monacoEditorTheme(theme)}
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
}
