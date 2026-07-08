import { useRef, type MutableRefObject } from "react";
import type { MonacoEditor, MonacoModule } from "./types.js";

export interface MonacoEditorRefs {
  editorRef: MutableRefObject<MonacoEditor | null>;
  monacoRef: MutableRefObject<MonacoModule | null>;
  wrapRef: MutableRefObject<HTMLDivElement | null>;
}

export function useMonacoEditorRefs(): MonacoEditorRefs {
  return {
    editorRef: useRef<MonacoEditor | null>(null),
    monacoRef: useRef<MonacoModule | null>(null),
    wrapRef: useRef<HTMLDivElement | null>(null),
  };
}
