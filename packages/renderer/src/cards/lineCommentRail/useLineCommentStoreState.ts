import { useStore } from "../../state/store.js";

export function useLineCommentStoreState() {
  return {
    currentSessionId: useStore((s) => s.currentSessionId),
    currentUserId: useStore((s) => s.currentUserId),
    token: useStore((s) => s.token),
    sessions: useStore((s) => s.sessions),
    activePath: useStore((s) => s.activePath),
    activePathId: useStore((s) => s.activePathId),
    activeTarget: useStore((s) => s.commentTarget),
    setCommentTarget: useStore((s) => s.setCommentTarget),
    setRightTab: useStore((s) => s.setRightTab),
    upsertEvent: useStore((s) => s.upsertEvent),
  };
}
