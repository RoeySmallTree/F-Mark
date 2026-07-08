import {
  useCallback,
  useEffect,
  useState,
  type MutableRefObject,
} from "react";
import type { LineBox } from "../../lineComment/lineMeasure.js";
import type { MonacoEditor, MonacoModule } from "./types.js";

export function useMonacoLineLayout({
  editorRef,
  monacoRef,
  ready,
  lineCount,
}: {
  editorRef: MutableRefObject<MonacoEditor | null>;
  monacoRef: MutableRefObject<MonacoModule | null>;
  ready: boolean;
  lineCount: number;
}): { lineBoxes: LineBox[]; lineHeight: number } {
  const [layout, setLayout] = useState<{ lineBoxes: LineBox[]; lineHeight: number }>(
    () => ({ lineBoxes: [], lineHeight: 18 }),
  );

  const refresh = useCallback((): void => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (editor === null || monaco === null) return;
    const lineHeight = editor.getOption(monaco.editor.EditorOption.lineHeight);
    const scrollTop = editor.getScrollTop();
    const maxLine = Math.max(1, lineCount);
    const lineBoxes: LineBox[] = [];
    for (let line = 1; line <= maxLine; line++) {
      const top = editor.getTopForLineNumber(line) - scrollTop;
      const bottom =
        line < maxLine
          ? editor.getTopForLineNumber(line + 1) - scrollTop
          : top + lineHeight;
      lineBoxes.push({ line, top, bottom, center: (top + bottom) / 2 });
    }
    setLayout({ lineBoxes, lineHeight });
  }, [editorRef, lineCount, monacoRef]);

  useEffect(() => {
    if (!ready) return;
    const editor = editorRef.current;
    if (editor === null) return;
    refresh();
    const disposables = [
      editor.onDidScrollChange(refresh),
      editor.onDidLayoutChange(refresh),
      editor.onDidChangeModelContent(refresh),
    ];
    return () => {
      for (const disposable of disposables) disposable.dispose();
    };
  }, [editorRef, ready, refresh]);

  return layout;
}
