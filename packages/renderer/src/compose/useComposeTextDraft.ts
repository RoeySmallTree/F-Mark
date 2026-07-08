import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ProseMention } from "@f-mark/shared";
import type { ComposeInsertion } from "../state/storeTypes.js";
import type { ComposeMode } from "./composeHelpers.js";
import { appendDroppedPath, appendToken } from "./composeHelpers.js";

const NO_LOOSE_STRING_VALUES = {
  named: "named",
  message: "message",
} as const;

interface UseComposeTextDraftOptions {
  activeMode: ComposeMode;
  composeDraft: string | null;
  setComposeDraft(draft: string | null): void;
  composeInsertion: ComposeInsertion | null;
  clearComposeInsertion(): void;
  setMode(mode: "message" | "named" | "comment"): void;
}

export interface TextInsertionRange {
  start: number;
  end: number;
}

export interface ComposeTextDraftState {
  textareaRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  content: string;
  setContent: React.Dispatch<React.SetStateAction<string>>;
  name: string;
  setName: React.Dispatch<React.SetStateAction<string>>;
  selectedMentions: ProseMention[];
  selectedMentionIds: Set<string>;
  addMention(mention: ProseMention): void;
  insertText(text: string, range?: TextInsertionRange): void;
  appendPath(path: string): void;
  clearAfterSubmit(): void;
  handleEscape(): boolean;
  onCancelName(): void;
}

export function useComposeTextDraft({
  activeMode,
  composeDraft,
  setComposeDraft,
  composeInsertion,
  clearComposeInsertion,
  setMode,
}: UseComposeTextDraftOptions): ComposeTextDraftState {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingSelectionRef = useRef<number | null>(null);
  const [content, setContent] = useState("");
  const [name, setName] = useState("");
  const [selectedMentions, setSelectedMentions] = useState<ProseMention[]>([]);

  const selectedMentionIds = useMemo(
    () => new Set(selectedMentions.map((mention) => mention.participant_id)),
    [selectedMentions],
  );

  const focusTextarea = useCallback((): void => {
    queueMicrotask(() => textareaRef.current?.focus());
  }, []);

  const addMention = useCallback(
    (mention: ProseMention): void => {
      if (selectedMentionIds.has(mention.participant_id)) {
        focusTextarea();
        return;
      }
      setSelectedMentions((prev) => [...prev, mention]);
      setContent((prev) => appendToken(prev, mention.token));
      focusTextarea();
    },
    [focusTextarea, selectedMentionIds],
  );

  const insertText = useCallback(
    (text: string, range?: TextInsertionRange): void => {
      const selection = range ?? selectionRange(textareaRef.current, content);
      setContent((prev) => {
        const next = insertInlineText(prev, text, selection);
        pendingSelectionRef.current = next.caret;
        return next.value;
      });
      focusTextarea();
    },
    [content, focusTextarea],
  );

  const appendPath = useCallback(
    (path: string): void => {
      setContent((prev) => appendDroppedPath(prev, path));
      focusTextarea();
    },
    [focusTextarea],
  );

  const clearAfterSubmit = useCallback((): void => {
    setContent("");
    setSelectedMentions([]);
    if (activeMode === NO_LOOSE_STRING_VALUES.named) setName("");
  }, [activeMode]);

  const handleEscape = useCallback((): boolean => {
    if (
      textareaRef.current !== null &&
      document.activeElement === textareaRef.current
    ) {
      textareaRef.current.blur();
      return true;
    }
    return false;
  }, []);

  const onCancelName = useCallback((): void => {
    setMode(NO_LOOSE_STRING_VALUES.message);
    setName("");
  }, [setMode]);

  useEffect(() => {
    if (composeDraft === null) return;
    setContent((prev) => {
      const trimmed = prev.trim();
      if (trimmed.length === 0) return composeDraft;
      return `${prev}\n\n${composeDraft}`;
    });
    setComposeDraft(null);
    queueMicrotask(() => {
      const ta = textareaRef.current;
      if (ta === null) return;
      ta.focus();
      const end = ta.value.length;
      try {
        ta.setSelectionRange(end, end);
      } catch {
        /* ignore: textarea supports this in browsers */
      }
    });
  }, [composeDraft, setComposeDraft]);

  useEffect(() => {
    if (composeInsertion === null) return;
    insertText(composeInsertion.text);
    clearComposeInsertion();
  }, [clearComposeInsertion, composeInsertion, insertText]);

  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (ta === null) return;
    const pendingSelection = pendingSelectionRef.current;
    if (pendingSelection !== null) {
      pendingSelectionRef.current = null;
      try {
        ta.setSelectionRange(pendingSelection, pendingSelection);
      } catch {
        /* ignore: textarea supports this in browsers */
      }
    }
    ta.style.height = "24px";
    const next = Math.min(ta.scrollHeight, 140);
    ta.style.height = `${next}px`;
  }, [content, activeMode]);

  return {
    textareaRef,
    content,
    setContent,
    name,
    setName,
    selectedMentions,
    selectedMentionIds,
    addMention,
    insertText,
    appendPath,
    clearAfterSubmit,
    handleEscape,
    onCancelName,
  };
}

function selectionRange(
  textarea: HTMLTextAreaElement | null,
  fallbackContent: string,
): TextInsertionRange {
  if (textarea === null) {
    return { start: fallbackContent.length, end: fallbackContent.length };
  }
  return {
    start: textarea.selectionStart,
    end: textarea.selectionEnd,
  };
}

function insertInlineText(
  value: string,
  text: string,
  range: TextInsertionRange,
): { value: string; caret: number } {
  const start = clamp(range.start, 0, value.length);
  const end = clamp(range.end, start, value.length);
  const before = value.slice(0, start);
  const after = value.slice(end);
  const prefix = before.length > 0 && !/\s$/.test(before) ? " " : "";
  const withPrefix = `${prefix}${text}`;
  const suffix =
    after.length > 0 && !/^\s/.test(after) && !/\s$/.test(withPrefix)
      ? " "
      : "";
  return {
    value: `${before}${withPrefix}${suffix}${after}`,
    caret: before.length + withPrefix.length,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
