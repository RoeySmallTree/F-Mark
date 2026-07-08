import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { ProseMention } from "@f-mark/shared";
import { useStore } from "../../../../state/store.js";
import { currentFileCommentWho } from "./model.js";
import type {
  FileCommentDraftController,
  FileCommentDraftPopoverProps,
} from "./types.js";

export function useFileCommentDraftController({
  busy,
  defaultMentions,
  onSubmit,
  onClose,
}: FileCommentDraftPopoverProps): FileCommentDraftController {
  const participants = useStore((s) => s.participants);
  const currentUserId = useStore((s) => s.currentUserId);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const token = useStore((s) => s.token);

  const popoverRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [draft, setDraft] = useState("");
  const [selectedMentions, setSelectedMentions] =
    useState<ProseMention[]>(defaultMentions);
  const [mentionAnchorRect, setMentionAnchorRect] = useState<DOMRect | null>(
    null,
  );

  const currentWho = currentFileCommentWho(currentUserId, participants);
  const selectedMentionIds = useMemo(
    () => new Set(selectedMentions.map((m) => m.participant_id)),
    [selectedMentions],
  );

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    function onDocumentMouseDown(e: globalThis.MouseEvent): void {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (popoverRef.current?.contains(target) === true) return;
      const el = target instanceof Element ? target : target.parentElement;
      if (el?.closest(".fv-line-comment-affordance") != null) return;
      if (el?.closest(".agent-mention-popover") != null) return;
      onClose();
    }
    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, [onClose]);

  const onToggleMention = useCallback((mention: ProseMention): void => {
    setSelectedMentions((prev) =>
      prev.some((m) => m.participant_id === mention.participant_id)
        ? prev.filter((m) => m.participant_id !== mention.participant_id)
        : [...prev, mention],
    );
  }, []);

  const onOpenMentions = useCallback((): void => {
    const rect =
      textareaRef.current?.getBoundingClientRect() ??
      popoverRef.current?.getBoundingClientRect() ??
      null;
    setMentionAnchorRect(rect);
  }, []);

  const submit = useCallback((): void => {
    const content = draft.trim();
    if (busy || content.length === 0) return;
    onSubmit(content, selectedMentions);
  }, [busy, draft, onSubmit, selectedMentions]);

  const onDraftChange = useCallback(
    (value: string): void => {
      setDraft(value);
      if (value.endsWith("@")) onOpenMentions();
    },
    [onOpenMentions],
  );

  const onDraftKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        submit();
      }
    },
    [onClose, submit],
  );

  return {
    popoverRef,
    textareaRef,
    currentWho,
    participants,
    currentSessionId,
    token,
    draft,
    selectedMentions,
    selectedMentionIds,
    mentionAnchorRect,
    onDraftChange,
    onDraftKeyDown,
    onOpenMentions,
    onCloseMentions: () => setMentionAnchorRect(null),
    onToggleMention,
    onSubmit: submit,
  };
}
