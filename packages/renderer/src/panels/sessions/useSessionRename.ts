import {
  useCallback,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { createClient } from "../../api/client.js";
import type { SessionMeta } from "../../api/client.js";
import type { SessionActionBaseInput } from "./actionTypes.js";
import {
  SLUG_RE,
  replaceSessionInList,
  withFallbackPath,
} from "./model.js";

type UseSessionRenameInput = SessionActionBaseInput;

export interface SessionRenameState {
  beginRename: (session: SessionMeta) => void;
  cancelRename: () => void;
  renameValue: string;
  renamingSessionId: string | null;
  saveRename: (session: SessionMeta) => Promise<void>;
  setRenameValue: Dispatch<SetStateAction<string>>;
}

function renamePayload(session: SessionMeta, slug: string): {
  slug: string;
  path?: string;
  path_id?: string;
} {
  if (session.path_id !== undefined) return { slug, path_id: session.path_id };
  if (session.path !== undefined) return { slug, path: session.path };
  return { slug };
}

export function useSessionRename(
  input: UseSessionRenameInput,
): SessionRenameState {
  const {
    activePath,
    closeContextMenu,
    currentSessionId,
    refreshSelectedRootSessions,
    setAllSessions,
    setCurrentSession,
    setError,
    token,
  } = input;
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const beginRename = useCallback(
    (session: SessionMeta): void => {
      closeContextMenu();
      setRenamingSessionId(session.id);
      setRenameValue(session.slug);
    },
    [closeContextMenu],
  );

  const cancelRename = useCallback((): void => {
    setRenamingSessionId(null);
    setRenameValue("");
  }, []);

  const saveRename = useCallback(
    async (session: SessionMeta): Promise<void> => {
      setError(null);
      const nextSlug = renameValue.trim();
      if (!SLUG_RE.test(nextSlug)) {
        setError("Session name must use lowercase letters, numbers, and hyphens.");
        return;
      }
      const client = createClient({ baseUrl: "", token });
      try {
        const updated = await client.updateSession(
          session.id,
          renamePayload(session, nextSlug),
        );
        const withPath = withFallbackPath(updated, session.path ?? activePath);
        setAllSessions((prev) =>
          replaceSessionInList(prev, session, withPath, activePath),
        );
        if (session.id === currentSessionId) setCurrentSession(updated.id, withPath);
        if (session.path === undefined || session.path === activePath) {
          await refreshSelectedRootSessions(withPath);
        }
        cancelRename();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [
      activePath,
      cancelRename,
      currentSessionId,
      refreshSelectedRootSessions,
      renameValue,
      setAllSessions,
      setCurrentSession,
      setError,
      token,
    ],
  );

  return {
    beginRename,
    cancelRename,
    renameValue,
    renamingSessionId,
    saveRename,
    setRenameValue,
  };
}
