import { useEffect, type MutableRefObject } from "react";
import type { RenderedCommentAnchor } from "../../lineComment/renderedRail/commentAnchors.js";
import type { MonacoEditor } from "./types.js";

const commentedLinesMap = new WeakMap<MonacoEditor, Set<number>>();

/** Tracks which editor lines already have comment threads (suppress draft "+" there). */
export function useMonacoCommentedLines({
  anchors,
  editorRef,
  ready,
}: {
  anchors: RenderedCommentAnchor[];
  editorRef: MutableRefObject<MonacoEditor | null>;
  ready: boolean;
}): void {
  useEffect(() => {
    const editor = editorRef.current;
    if (!ready || editor === null) return;
    const lines = new Set<number>();
    for (const anchor of anchors) {
      for (let line = anchor.lines[0]; line <= anchor.lines[1]; line++) {
        lines.add(line);
      }
    }
    commentedLinesMap.set(editor, lines);
  }, [anchors, editorRef, ready]);
}

export function commentedLinesForMonaco(
  editor: MonacoEditor | null,
): Set<number> {
  if (editor === null) return new Set();
  return commentedLinesMap.get(editor) ?? new Set();
}
