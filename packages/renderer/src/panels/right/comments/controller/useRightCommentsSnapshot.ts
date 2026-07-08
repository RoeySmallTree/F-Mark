import { useShallow } from "zustand/react/shallow";
import { useStore } from "../../../../state/store.js";
import type { State } from "../../../../state/storeTypes.js";

export type RightCommentsSnapshot = Pick<
  State,
  | "activePath"
  | "activePathId"
  | "commentTarget"
  | "currentSessionId"
  | "currentUserId"
  | "events"
  | "focusedCommentId"
  | "participants"
  | "sessions"
  | "setCommentTarget"
  | "setFocusedCommentId"
  | "setRightTab"
  | "token"
  | "upsertEvent"
>;

export function useRightCommentsSnapshot(): RightCommentsSnapshot {
  return useStore(
    useShallow((state): RightCommentsSnapshot => ({
      activePath: state.activePath,
      activePathId: state.activePathId,
      commentTarget: state.commentTarget,
      currentSessionId: state.currentSessionId,
      currentUserId: state.currentUserId,
      events: state.events,
      focusedCommentId: state.focusedCommentId,
      participants: state.participants,
      sessions: state.sessions,
      setCommentTarget: state.setCommentTarget,
      setFocusedCommentId: state.setFocusedCommentId,
      setRightTab: state.setRightTab,
      token: state.token,
      upsertEvent: state.upsertEvent,
    })),
  );
}
