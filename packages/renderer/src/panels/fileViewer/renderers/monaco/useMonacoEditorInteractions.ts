import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import type { OnMount } from "@monaco-editor/react";
import type { IDisposable } from "monaco-editor";
import {
  lineRangeForGlyphClick,
  normalizeSelectionLines,
} from "./selection.js";
import { commentedLinesForMonaco } from "./useMonacoCommentedLines.js";
import type {
  LineRange,
  MonacoDecorationsCollection,
  MonacoEditor,
  MonacoModule,
} from "./types.js";

const selectionGlyphMap = new WeakMap<
  MonacoEditor,
  MonacoDecorationsCollection
>();

export interface MonacoEditorInteractionController {
  onMount: OnMount;
  ready: boolean;
}

export function useMonacoEditorInteractions({
  editorRef,
  monacoRef,
  canPost,
  openDraft,
  updateDraftTop,
}: {
  editorRef: MutableRefObject<MonacoEditor | null>;
  monacoRef: MutableRefObject<MonacoModule | null>;
  canPost: boolean;
  openDraft: (lines: LineRange) => void;
  updateDraftTop: (editor: MonacoEditor) => void;
}): MonacoEditorInteractionController {
  const hoverGlyphRef = useRef<MonacoDecorationsCollection | null>(null);
  const disposablesRef = useRef<IDisposable[]>([]);
  const openDraftRef = useRef(openDraft);
  const updateDraftTopRef = useRef(updateDraftTop);
  const [selection, setSelection] = useState<LineRange | null>(null);
  const [ready, setReady] = useState(false);

  openDraftRef.current = openDraft;
  updateDraftTopRef.current = updateDraftTop;

  const onMount = useCallback<OnMount>(
    (ed, monaco) => {
      editorRef.current = ed;
      monacoRef.current = monaco;
      hoverGlyphRef.current = ed.createDecorationsCollection();

      disposablesRef.current.push(
        ed.onMouseMove((e) => {
          const target = e.target;
          const line = target.position?.lineNumber;
          const inCommentableZone =
            target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
            target.type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS ||
            target.type === monaco.editor.MouseTargetType.CONTENT_TEXT;
          if (line === undefined || !inCommentableZone) {
            hoverGlyphRef.current?.clear();
            return;
          }
          if (commentedLinesForMonaco(ed).has(line)) {
            hoverGlyphRef.current?.clear();
            return;
          }
          hoverGlyphRef.current?.set([
            {
              range: new monaco.Range(line, 1, line, 1),
              options: {
                glyphMarginClassName: "fv-line-comment-glyph",
                glyphMarginHoverMessage: { value: "Add comment" },
              },
            },
          ]);
        }),
        ed.onMouseLeave(() => hoverGlyphRef.current?.clear()),
        ed.onMouseDown((e) => {
          const target = e.target;
          if (
            target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN
          ) {
            return;
          }
          const line = target.position?.lineNumber;
          if (line === undefined) return;
          if (commentedLinesForMonaco(ed).has(line)) return;
          e.event.preventDefault();
          const sel = ed.getSelection();
          const lines = lineRangeForGlyphClick(
            line,
            sel !== null && !sel.isEmpty() ? sel : null,
          );
          openDraftRef.current(lines);
        }),
        ed.onDidChangeCursorSelection((e) => {
          const next = e.selection.isEmpty()
            ? null
            : normalizeSelectionLines(e.selection);
          setSelection(next);
        }),
        ed.onDidScrollChange(() => {
          updateDraftTopRef.current(ed);
        }),
      );

      setReady(true);
    },
    [editorRef, monacoRef],
  );

  useEffect(() => {
    syncSelectionGlyph(editorRef.current, monacoRef.current, selection, canPost);
  }, [canPost, editorRef, monacoRef, selection]);

  useEffect(() => {
    return () => {
      for (const d of disposablesRef.current) d.dispose();
      disposablesRef.current = [];
      hoverGlyphRef.current?.clear();
      hoverGlyphRef.current = null;
      const ed = editorRef.current;
      if (ed !== null) {
        selectionGlyphMap.get(ed)?.clear();
        selectionGlyphMap.delete(ed);
      }
    };
  }, [editorRef]);

  return { onMount, ready };
}

function syncSelectionGlyph(
  editor: MonacoEditor | null,
  monaco: MonacoModule | null,
  selection: LineRange | null,
  canPost: boolean,
): void {
  if (editor === null || monaco === null) return;
  let collection = selectionGlyphMap.get(editor);
  if (collection === undefined) {
    collection = editor.createDecorationsCollection();
    selectionGlyphMap.set(editor, collection);
  }
  if (selection === null || selection[0] === selection[1] || !canPost) {
    collection.clear();
    return;
  }
  if (commentedLinesForMonaco(editor).has(selection[0])) {
    collection.clear();
    return;
  }
  collection.set([
    {
      range: new monaco.Range(selection[0], 1, selection[0], 1),
      options: {
        glyphMarginClassName: "fv-line-comment-glyph active",
        glyphMarginHoverMessage: {
          value: `Comment lines ${selection[0]}-${selection[1]}`,
        },
      },
    },
  ]);
}
