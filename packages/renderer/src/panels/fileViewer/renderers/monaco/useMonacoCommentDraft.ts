import { useCallback, useState, type MutableRefObject } from "react";
import type { ProseMention } from "@f-mark/shared";
import {
  buildLineContext,
  snippetForLines,
} from "../../lineComment/lineContext.js";
import {
  useDefaultFileCommentMentions,
} from "../../lineComment/FileCommentDraftPopover.js";
import { useFileCommentPoster } from "../../lineComment/useFileCommentPoster.js";
import type { LineRange, MonacoDraftState, MonacoEditor } from "./types.js";

export interface MonacoCommentDraftController {
  busy: boolean;
  canPost: boolean;
  defaultMentions: ProseMention[];
  draft: MonacoDraftState | null;
  draftSnippet: string;
  openDraft: (lines: LineRange) => void;
  closeDraft: () => void;
  submitDraft: (content: string, mentions: ProseMention[]) => Promise<void>;
  updateDraftTop: (editor: MonacoEditor) => void;
}

export function useMonacoCommentDraft({
  path,
  text,
  editorRef,
}: {
  path: string;
  text: string | null;
  editorRef: MutableRefObject<MonacoEditor | null>;
}): MonacoCommentDraftController {
  const poster = useFileCommentPoster();
  const defaultMentions = useDefaultFileCommentMentions();
  const [draft, setDraft] = useState<MonacoDraftState | null>(null);

  const openDraft = useCallback(
    (lines: LineRange): void => {
      const ed = editorRef.current;
      if (ed === null || !poster.canPost) return;
      const top = ed.getTopForLineNumber(lines[0]) - ed.getScrollTop();
      setDraft({ lines, top });
    },
    [editorRef, poster.canPost],
  );

  const closeDraft = useCallback((): void => {
    setDraft(null);
  }, []);

  const updateDraftTop = useCallback((editor: MonacoEditor): void => {
    setDraft((prev) => {
      if (prev === null) return prev;
      const top =
        editor.getTopForLineNumber(prev.lines[0]) - editor.getScrollTop();
      return { ...prev, top };
    });
  }, []);

  const submitDraft = useCallback(
    async (content: string, mentions: ProseMention[]): Promise<void> => {
      if (draft === null) return;
      const model = editorRef.current?.getModel();
      const fullText = model?.getValue() ?? text ?? "";
      const lineContext = buildLineContext(fullText, draft.lines);
      const filename = await poster.postFileComment({
        absPath: path,
        lines: draft.lines,
        content,
        ...(mentions.length > 0 ? { mentions } : {}),
        lineContext,
      });
      if (filename !== null) closeDraft();
    },
    [draft, editorRef, text, path, poster, closeDraft],
  );

  const draftSnippet =
    draft !== null
      ? snippetForLines(
          editorRef.current?.getModel()?.getValue() ?? text ?? "",
          draft.lines,
        )
      : "";

  return {
    busy: poster.busy,
    canPost: poster.canPost,
    defaultMentions,
    draft,
    draftSnippet,
    openDraft,
    closeDraft,
    submitDraft,
    updateDraftTop,
  };
}
