import type { editor as MonacoEditorNs } from "monaco-editor";

export type LineRange = [number, number];

export interface MonacoLineSpan {
  startLineNumber: number;
  endLineNumber: number;
  endColumn: number;
}

export interface MonacoDraftState {
  lines: LineRange;
  top: number;
}

export type MonacoEditor = MonacoEditorNs.IStandaloneCodeEditor;
export type MonacoModule = typeof import("monaco-editor");
export type MonacoDecorationsCollection =
  MonacoEditorNs.IEditorDecorationsCollection;
