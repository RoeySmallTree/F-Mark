import { useCallback, useState } from "react";
import type { Participant } from "@f-mark/shared";
import { createClient } from "../../api/client.js";
import type { SessionMeta } from "../../api/client.js";
import { rootScopeForSession } from "../../api/rootScope.js";
import { sessionKey } from "./model.js";

type Client = ReturnType<typeof createClient>;
type RootScopeValue = NonNullable<ReturnType<typeof rootScopeForSession>>;

interface UseSessionSelectionInput {
  activePath: string | null;
  activePathId: string | null;
  currentSessionId: string | null;
  setCurrentSession: (
    id: string | null,
    root?: { path?: string; path_id?: string } | null,
  ) => void;
  setError: (error: string | null) => void;
  setParticipants: (participants: Record<string, Participant>) => void;
  setSessions: (sessions: SessionMeta[]) => void;
  token: string | null;
}

export interface SessionSelectionState {
  refreshSelectedRootSessions: (session: SessionMeta | null) => Promise<void>;
  selectSession: (session: SessionMeta) => Promise<void>;
  switchingSessionKey: string | null;
}

async function loadRootSessionState(
  client: Client,
  scope: RootScopeValue | null,
): Promise<{
  list: SessionMeta[];
  nextParticipants: Record<string, Participant>;
}> {
  const [list, nextParticipants] = await Promise.all([
    client.listSessions(scope ?? undefined),
    client.listParticipants(scope ?? undefined),
  ]);
  return { list, nextParticipants };
}

export function useSessionSelection(
  input: UseSessionSelectionInput,
): SessionSelectionState {
  const {
    activePath,
    activePathId,
    setCurrentSession,
    setError,
    setParticipants,
    setSessions,
    token,
  } = input;
  const [switchingSessionKey, setSwitchingSessionKey] = useState<string | null>(
    null,
  );

  const refreshSelectedRootSessions = useCallback(
    async (session: SessionMeta | null): Promise<void> => {
      const client = createClient({ baseUrl: "", token });
      const scope = rootScopeForSession(
        session ?? undefined,
        activePathId,
        activePath,
      );
      const { list, nextParticipants } = await loadRootSessionState(client, scope);
      setSessions(list);
      setParticipants(nextParticipants);
    },
    [activePath, activePathId, setParticipants, setSessions, token],
  );

  const selectSession = useCallback(
    async (session: SessionMeta): Promise<void> => {
      const client = createClient({ baseUrl: "", token });
      setSwitchingSessionKey(sessionKey(session, activePath));
      setError(null);
      const scope = rootScopeForSession(session, activePathId, activePath);
      setCurrentSession(session.id, session);
      try {
        const { list, nextParticipants } = await loadRootSessionState(
          client,
          scope,
        );
        setSessions(list);
        setParticipants(nextParticipants);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setSwitchingSessionKey(null);
      }
    },
    [
      activePath,
      activePathId,
      setCurrentSession,
      setError,
      setParticipants,
      setSessions,
      token,
    ],
  );

  return {
    refreshSelectedRootSessions,
    selectSession,
    switchingSessionKey,
  };
}
