import { useStore } from "../state/store.js";

export function useComposeStoreBindings(): {
  token: string | null;
  sessionId: string | null;
  userId: string | null;
  mode: string;
  setMode(mode: "message" | "named" | "comment"): void;
  composeDraft: string | null;
  setComposeDraft(draft: string | null): void;
  composeInsertion: ReturnType<typeof useStore.getState>["composeInsertion"];
  clearComposeInsertion(): void;
  requestScrollToBottom(): void;
} {
  const token = useStore((s) => s.token);
  const sessionId = useStore((s) => s.currentSessionId);
  const userId = useStore((s) => s.currentUserId);
  const mode = useStore((s) => s.composeMode);
  const setMode = useStore((s) => s.setComposeMode);
  const composeDraft = useStore((s) => s.composeDraft);
  const setComposeDraft = useStore((s) => s.setComposeDraft);
  const composeInsertion = useStore((s) => s.composeInsertion);
  const clearComposeInsertion = useStore((s) => s.clearComposeInsertion);
  const requestScrollToBottom = useStore((s) => s.requestScrollToBottom);

  return {
    token,
    sessionId,
    userId,
    mode,
    setMode,
    composeDraft,
    setComposeDraft,
    composeInsertion,
    clearComposeInsertion,
    requestScrollToBottom,
  };
}
