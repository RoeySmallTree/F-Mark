import { useCallback, useMemo } from "react";
import { rootScopeForSession } from "../../api/rootScope.js";
import { useStore } from "../../state/store.js";
import { buildCommentThreadModel } from "./model.js";
import { useCommentThreadActions } from "./useCommentThreadActions.js";
import type {
  CommentThreadOverlayController,
  CommentThreadOverlayProps,
} from "./types.js";

export function useCommentThreadOverlay(
  props: CommentThreadOverlayProps,
): CommentThreadOverlayController {
  const events = useStore((state) => state.events);
  const participants = useStore((state) => state.participants);
  const setCommentTarget = useStore((state) => state.setCommentTarget);
  const commentTarget = useStore((state) => state.commentTarget);
  const currentSessionId = useStore((state) => state.currentSessionId);
  const currentUserId = useStore((state) => state.currentUserId);
  const token = useStore((state) => state.token);
  const upsertEvent = useStore((state) => state.upsertEvent);
  const sessions = useStore((state) => state.sessions);
  const activePath = useStore((state) => state.activePath);
  const activePathId = useStore((state) => state.activePathId);

  const lines = commentTarget?.lines;
  const scope = useMemo(() => {
    if (currentSessionId === null) return null;
    const session = sessions.find((item) => item.id === currentSessionId);
    return rootScopeForSession(session, activePathId, activePath);
  }, [activePath, activePathId, currentSessionId, sessions]);

  const model = useMemo(
    () =>
      buildCommentThreadModel({
        events,
        comments: props.comments,
        targetFile: props.targetFile,
        lines,
      }),
    [events, lines, props.comments, props.targetFile],
  );

  const actions = useCommentThreadActions({
    currentSessionId,
    currentUserId,
    scope,
    token,
    targetFile: props.targetFile,
    lines,
    target: model.target,
    participants,
    upsertEvent,
  });

  const onClose = useCallback(() => {
    setCommentTarget(null);
  }, [setCommentTarget]);

  return {
    ...model,
    participants,
    onClose,
    ...actions,
  };
}
