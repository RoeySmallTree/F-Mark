import { useCallback } from "react";
import type { SessionMeta } from "@f-mark/shared";
import type { ResolvedSessionActions } from "./useResolvedSessionActions.js";

interface SessionSwitcherInput {
  currentSessionId: string | null;
  activePathId: string | null;
  closeDropdown(): void;
  sessionActions: ResolvedSessionActions;
}

export function useSessionSwitcher({
  currentSessionId,
  activePathId,
  closeDropdown,
  sessionActions,
}: SessionSwitcherInput): (session: SessionMeta) => void {
  return useCallback(
    (session: SessionMeta): void => {
      closeDropdown();
      if (session.id === currentSessionId && session.path_id === activePathId) {
        return;
      }
      sessionActions.applySessionNamespace(session);
      sessionActions.seedResolvedSession(session);
    },
    [activePathId, closeDropdown, currentSessionId, sessionActions],
  );
}
