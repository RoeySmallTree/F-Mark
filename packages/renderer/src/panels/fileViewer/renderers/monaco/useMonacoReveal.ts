import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import type { PendingFileReveal } from "../../../../state/fileViewerPersistence.js";
import { useStore } from "../../../../state/store.js";
import { relocateLine } from "../../lineComment/relocateLine.js";
import type {
  MonacoDecorationsCollection,
  MonacoEditor,
  MonacoModule,
} from "./types.js";

export interface MonacoRevealController {
  driftHint: boolean;
}

export function useMonacoReveal({
  path,
  text,
  ready,
  editorRef,
  monacoRef,
}: {
  path: string;
  text: string | null;
  ready: boolean;
  editorRef: MutableRefObject<MonacoEditor | null>;
  monacoRef: MutableRefObject<MonacoModule | null>;
}): MonacoRevealController {
  const pendingFileReveal = useStore((s) => s.pendingFileReveal);
  const clearFileReveal = useStore((s) => s.clearFileReveal);
  const flashRef = useRef<MonacoDecorationsCollection | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  const driftTimerRef = useRef<number | null>(null);
  const [driftHint, setDriftHint] = useState(false);

  const revealAndFlash = useCallback(
    (line: number): void => {
      const ed = editorRef.current;
      const monaco = monacoRef.current;
      if (ed === null || monaco === null) return;
      flashLine(ed, monaco, line, flashRef, flashTimerRef);
    },
    [editorRef, monacoRef],
  );

  useEffect(() => {
    if (pendingFileReveal === null) return;
    if (pendingFileReveal.absPath !== path) return;
    if (!ready || editorRef.current === null) return;

    const currentText =
      editorRef.current.getModel()?.getValue() ?? text ?? "";
    const { targetLine, drifted } = resolveRevealTarget(
      pendingFileReveal,
      currentText,
    );

    clearWindowTimer(driftTimerRef);
    if (targetLine !== null) revealAndFlash(targetLine);
    if (drifted) {
      setDriftHint(true);
      driftTimerRef.current = window.setTimeout(() => {
        setDriftHint(false);
        driftTimerRef.current = null;
      }, 4000);
    } else {
      setDriftHint(false);
    }
    clearFileReveal();
  }, [
    clearFileReveal,
    editorRef,
    path,
    pendingFileReveal,
    ready,
    revealAndFlash,
    text,
  ]);

  useEffect(() => {
    return () => {
      clearWindowTimer(flashTimerRef);
      clearWindowTimer(driftTimerRef);
      flashRef.current?.clear();
      flashRef.current = null;
    };
  }, []);

  return { driftHint };
}

function resolveRevealTarget(
  pending: PendingFileReveal,
  currentText: string,
): { targetLine: number | null; drifted: boolean } {
  if (pending.lineContext === undefined && pending.lines === undefined) {
    return { targetLine: pending.line, drifted: false };
  }
  const result = relocateLine(currentText, pending.lineContext, pending.lines);
  return { targetLine: result.line, drifted: result.drifted };
}

function flashLine(
  editor: MonacoEditor,
  monaco: MonacoModule,
  line: number,
  flashRef: MutableRefObject<MonacoDecorationsCollection | null>,
  timerRef: MutableRefObject<number | null>,
): void {
  const model = editor.getModel();
  const max = model?.getLineCount() ?? line;
  const target = Math.min(Math.max(1, line), Math.max(1, max));
  editor.revealLineInCenter(target);
  const collection =
    flashRef.current ?? (flashRef.current = editor.createDecorationsCollection());
  collection.set([
    {
      range: new monaco.Range(target, 1, target, 1),
      options: {
        isWholeLine: true,
        className: "fv-line-comment-flash",
        marginClassName: "fv-line-comment-flash",
      },
    },
  ]);
  clearWindowTimer(timerRef);
  timerRef.current = window.setTimeout(() => {
    flashRef.current?.clear();
    timerRef.current = null;
  }, 1400);
}

function clearWindowTimer(timerRef: MutableRefObject<number | null>): void {
  if (timerRef.current === null) return;
  window.clearTimeout(timerRef.current);
  timerRef.current = null;
}
