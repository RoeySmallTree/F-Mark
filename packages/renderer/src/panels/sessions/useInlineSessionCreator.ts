import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { SessionMeta } from "../../api/client.js";
import { sortSessions, withFallbackPath } from "./model.js";

interface UseInlineSessionCreatorInput {
  refreshAllSessions: () => void;
  selectSession: (session: SessionMeta) => Promise<void>;
  setAllSessions: Dispatch<SetStateAction<SessionMeta[]>>;
}

export function useInlineSessionCreator(
  input: UseInlineSessionCreatorInput,
): (path: string, created: SessionMeta) => void {
  const { refreshAllSessions, selectSession, setAllSessions } = input;

  return useCallback(
    (path: string, created: SessionMeta): void => {
      const withPath = withFallbackPath(created, path);
      setAllSessions((prev) => sortSessions([withPath, ...prev]));
      refreshAllSessions();
      void selectSession(withPath);
    },
    [refreshAllSessions, selectSession, setAllSessions],
  );
}
