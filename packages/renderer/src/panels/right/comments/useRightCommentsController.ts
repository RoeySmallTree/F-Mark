import { useMemo } from "react";
import { whoOf } from "../../../cards/format.js";
import { buildCommentGroups } from "./commentModel.js";
import { useCommentEditor } from "./controller/useCommentEditor.js";
import { useCommentFocusController } from "./controller/useCommentFocusController.js";
import { useCommentPoster } from "./controller/useCommentPoster.js";
import { useCommentThreadActions } from "./controller/useCommentThreadActions.js";
import { useReplyComposer } from "./controller/useReplyComposer.js";
import { useRightCommentsSnapshot } from "./controller/useRightCommentsSnapshot.js";
import type {
  CommentThreadActions,
  MentionTarget,
  RightCommentsController as ControllerShape,
} from "./controller/types.js";

export type {
  CommentThreadActions,
  MentionTarget,
} from "./controller/types.js";

export interface RightCommentsController
  extends Omit<ControllerShape, "actions" | "mentionTarget"> {
  actions: CommentThreadActions;
  mentionTarget: MentionTarget | null;
}

const LOCAL_CURRENT_WHO = {
  id: "us-local",
  name: "You",
  initial: "Y",
  isUser: true,
} satisfies ReturnType<typeof whoOf>;

export function useRightCommentsController(): RightCommentsController {
  const snapshot = useRightCommentsSnapshot();
  const groups = useMemo(
    () => buildCommentGroups(snapshot.events),
    [snapshot.events],
  );
  const focus = useCommentFocusController({
    commentTarget: snapshot.commentTarget,
    focusedCommentId: snapshot.focusedCommentId,
    groups,
    setCommentTarget: snapshot.setCommentTarget,
    setFocusedCommentId: snapshot.setFocusedCommentId,
    setRightTab: snapshot.setRightTab,
  });
  const reply = useReplyComposer();
  const editor = useCommentEditor();
  const poster = useCommentPoster(snapshot);
  const actions = useCommentThreadActions({
    closeFocus: focus.closeFocus,
    editor,
    focusGroup: focus.focusGroup,
    postComment: poster.postComment,
    reply,
  });
  const currentWho = useMemo(
    () =>
      snapshot.currentUserId !== null
        ? whoOf(snapshot.currentUserId, snapshot.participants)
        : LOCAL_CURRENT_WHO,
    [snapshot.currentUserId, snapshot.participants],
  );

  return {
    actions,
    activeKey: focus.activeKey,
    addReplyMention: reply.addReplyMention,
    busyKey: poster.busyKey,
    closeReplyMentions: reply.closeReplyMentions,
    currentSessionId: snapshot.currentSessionId,
    currentWho,
    editing: editor.editing,
    groups,
    mentionTarget: reply.mentionTarget,
    panelRef: focus.panelRef,
    participants: snapshot.participants,
    replyDrafts: reply.replyDrafts,
    replyMentions: reply.replyMentions,
    token: snapshot.token,
  };
}
