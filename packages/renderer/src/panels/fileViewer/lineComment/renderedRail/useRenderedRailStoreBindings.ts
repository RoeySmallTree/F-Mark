import { useStore } from "../../../../state/store.js";

export function useRenderedRailStoreBindings() {
  return {
    token: useStore((state) => state.token),
    events: useStore((state) => state.events),
    activeTarget: useStore((state) => state.commentTarget),
    setCommentTarget: useStore((state) => state.setCommentTarget),
    setRightTab: useStore((state) => state.setRightTab),
    pendingFileReveal: useStore((state) => state.pendingFileReveal),
    clearFileReveal: useStore((state) => state.clearFileReveal),
  };
}
