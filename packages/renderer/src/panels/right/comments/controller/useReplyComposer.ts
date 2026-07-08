import { useCallback, useRef, useState } from "react";
import type { AnyEventRecord, ProseMention } from "@f-mark/shared";
import type { MentionTarget } from "./types.js";

export interface ReplyComposer {
  addReplyMention(rootFilename: string, mention: ProseMention): void;
  clearReplyState(rootFilename: string): void;
  closeReplyMentions(): void;
  mentionTarget: MentionTarget | null;
  openReplyMentions(root: AnyEventRecord, rect: DOMRect): void;
  replyDrafts: Record<string, string>;
  replyMentions: Record<string, ProseMention[]>;
  setReplyDraft(root: AnyEventRecord, value: string): void;
  setReplyInputRef(root: AnyEventRecord, node: HTMLInputElement | null): void;
}

export function useReplyComposer(): ReplyComposer {
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyMentions, setReplyMentions] = useState<
    Record<string, ProseMention[]>
  >({});
  const [mentionTarget, setMentionTarget] = useState<MentionTarget | null>(null);
  const replyInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const setReplyInputRef = useCallback(
    (root: AnyEventRecord, node: HTMLInputElement | null): void => {
      replyInputRefs.current[root.filename] = node;
    },
    [],
  );

  const openReplyMentions = useCallback(
    (root: AnyEventRecord, rect: DOMRect): void => {
      setMentionTarget({ rootFilename: root.filename, rect });
    },
    [],
  );

  const closeReplyMentions = useCallback((): void => {
    setMentionTarget(null);
  }, []);

  const setReplyDraft = useCallback(
    (root: AnyEventRecord, value: string): void => {
      setReplyDrafts((prev) => ({ ...prev, [root.filename]: value }));
    },
    [],
  );

  const clearReplyState = useCallback((rootFilename: string): void => {
    setReplyDrafts((prev) => ({ ...prev, [rootFilename]: "" }));
    setReplyMentions((prev) => {
      const next = { ...prev };
      delete next[rootFilename];
      return next;
    });
  }, []);

  const addReplyMention = useCallback(
    (rootFilename: string, mention: ProseMention): void => {
      const existing = replyMentions[rootFilename] ?? [];
      if (existing.some((item) => item.participant_id === mention.participant_id)) {
        setMentionTarget(null);
        queueReplyFocus(replyInputRefs.current[rootFilename]);
        return;
      }
      setReplyMentions((prev) => ({
        ...prev,
        [rootFilename]: [...(prev[rootFilename] ?? []), mention],
      }));
      setReplyDrafts((prev) => ({
        ...prev,
        [rootFilename]: appendMentionToken(prev[rootFilename] ?? "", mention),
      }));
      setMentionTarget(null);
      queueReplyFocus(replyInputRefs.current[rootFilename]);
    },
    [replyMentions],
  );

  return {
    addReplyMention,
    clearReplyState,
    closeReplyMentions,
    mentionTarget,
    openReplyMentions,
    replyDrafts,
    replyMentions,
    setReplyDraft,
    setReplyInputRef,
  };
}

function appendMentionToken(value: string, mention: ProseMention): string {
  const needsSpace = value.length > 0 && !/\s$/.test(value);
  return `${value}${needsSpace ? " " : ""}${mention.token} `;
}

function queueReplyFocus(node: HTMLInputElement | null | undefined): void {
  queueMicrotask(() => node?.focus());
}
