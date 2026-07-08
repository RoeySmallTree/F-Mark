import { useCallback, useMemo, type KeyboardEvent } from "react";
import type { AnyEventRecord } from "@f-mark/shared";
import { COMMENT_MARKER_CONTENT } from "../../../../comments/commentMarkers.js";
import {
  contentOf,
  inReplyToOf,
  type CommentGroup,
} from "../commentModel.js";
import type { CommentEditor } from "./useCommentEditor.js";
import type { PostComment } from "./useCommentPoster.js";
import type { ReplyComposer } from "./useReplyComposer.js";
import type { CommentThreadActions } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  removed: COMMENT_MARKER_CONTENT.removed,
} as const;

interface UseCommentThreadActionsInput {
  closeFocus(): void;
  editor: CommentEditor;
  focusGroup(group: CommentGroup): void;
  postComment: PostComment;
  reply: ReplyComposer;
}

export function useCommentThreadActions({
  closeFocus,
  editor,
  focusGroup,
  postComment,
  reply,
}: UseCommentThreadActionsInput): CommentThreadActions {
  const submitReply = useCallback(
    async (group: CommentGroup, root: AnyEventRecord): Promise<void> => {
      const key = root.filename;
      const text = reply.replyDrafts[key]?.trim() ?? "";
      if (text.length === 0) return;
      const mentions = reply.replyMentions[key] ?? [];
      reply.clearReplyState(key);
      await postComment(`reply:${key}`, group, {
        content: text,
        in_reply_to: root.filename,
        ...(mentions.length > 0 ? { mentions } : {}),
      });
    },
    [postComment, reply],
  );

  const addEmoji = useCallback(
    async (
      group: CommentGroup,
      root: AnyEventRecord,
      emoji: string,
    ): Promise<void> => {
      await postComment(`emoji:${root.filename}:${emoji}`, group, {
        content: emoji,
        in_reply_to: root.filename,
      });
    },
    [postComment],
  );

  const saveEdit = useCallback(
    async (group: CommentGroup, event: AnyEventRecord): Promise<void> => {
      const text = editor.editing[event.filename]?.trim() ?? "";
      if (text.length === 0) return;
      const inReplyTo = inReplyToOf(event);
      await postComment(`edit:${event.filename}`, group, {
        content: text,
        supersedes: event.filename,
        ...(inReplyTo === undefined ? {} : { in_reply_to: inReplyTo }),
      });
      editor.clearEdit(event.filename);
    },
    [editor, postComment],
  );

  const removeComment = useCallback(
    async (group: CommentGroup, event: AnyEventRecord): Promise<void> => {
      await postComment(`remove:${event.filename}`, group, {
        content: NO_LOOSE_STRING_VALUES.removed,
        supersedes: event.filename,
      });
    },
    [postComment],
  );

  const resolveComment = useCallback(
    async (group: CommentGroup, event: AnyEventRecord): Promise<void> => {
      await postComment(`resolve:${event.filename}`, group, {
        content: COMMENT_MARKER_CONTENT.resolved,
        supersedes: event.filename,
      });
    },
    [postComment],
  );

  const unresolveComment = useCallback(
    async (group: CommentGroup, event: AnyEventRecord): Promise<void> => {
      await postComment(`unresolve:${event.filename}`, group, {
        content: COMMENT_MARKER_CONTENT.unresolved,
        supersedes: event.filename,
      });
    },
    [postComment],
  );

  const onReplyKey = useCallback(
    (
      e: KeyboardEvent<HTMLInputElement>,
      group: CommentGroup,
      root: AnyEventRecord,
    ): void => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void submitReply(group, root);
      }
    },
    [submitReply],
  );

  return useMemo(
    (): CommentThreadActions => ({
      onCancelEdit: editor.cancelEdit,
      onClose: closeFocus,
      onEditDraft: editor.setEditDraft,
      onEmoji: addEmoji,
      onFocus: focusGroup,
      onOpenMentions: reply.openReplyMentions,
      onRemove: removeComment,
      onReplyDraft: reply.setReplyDraft,
      onReplyInputRef: reply.setReplyInputRef,
      onReplyKey,
      onResolve: resolveComment,
      onSaveEdit: saveEdit,
      onStartEdit: editor.startEdit,
      onSubmitReply: submitReply,
      onUnresolve: unresolveComment,
    }),
    [
      addEmoji,
      closeFocus,
      editor,
      focusGroup,
      onReplyKey,
      removeComment,
      reply,
      resolveComment,
      saveEdit,
      submitReply,
      unresolveComment,
    ],
  );
}
