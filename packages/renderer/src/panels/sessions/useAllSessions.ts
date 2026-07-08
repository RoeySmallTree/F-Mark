import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { createClient } from "../../api/client.js";
import type { SessionMeta } from "../../api/client.js";
import { connectWs } from "../../api/ws.js";
import { sessionKey, sortSessions, withFallbackPath } from "./model.js";

const NO_LOOSE_STRING_VALUES = {
  eventAdded: "event_added",
  pathSwitched: "path-switched",
  pathsUpdated: "paths-updated",
} as const;

interface UseAllSessionsInput {
  activePath: string | null;
  sessions: SessionMeta[];
  token: string | null;
}

export interface AllSessionsState {
  allSessions: SessionMeta[];
  loading: boolean;
  refreshAllSessions: () => void;
  setAllSessions: Dispatch<SetStateAction<SessionMeta[]>>;
}

export function useAllSessions(input: UseAllSessionsInput): AllSessionsState {
  const { activePath, sessions, token } = input;
  const [allSessions, setAllSessions] = useState<SessionMeta[]>(() =>
    sessions.map((session) => withFallbackPath(session, activePath)),
  );
  const [loading, setLoading] = useState(() => sessions.length === 0);

  useEffect(() => {
    if (sessions.length === 0) return;
    setAllSessions((prev) => {
      const byKey = new Map<string, SessionMeta>();
      for (const session of prev) {
        byKey.set(sessionKey(session, null), session);
      }
      for (const session of sessions) {
        const next = withFallbackPath(session, activePath);
        if (next.path !== undefined) {
          byKey.delete(`__current__::${next.id}`);
        }
        byKey.set(sessionKey(next, activePath), next);
      }
      return sortSessions([...byKey.values()]);
    });
  }, [sessions, activePath]);

  const refreshAllSessions = useCallback((): void => {
    const client = createClient({ baseUrl: "", token });
    setLoading(true);
    void (async () => {
      try {
        const list = await client.listAllSessions();
        if (Array.isArray(list)) {
          setAllSessions(sortSessions(list));
          return;
        }
      } catch {
        try {
          const list = await client.listSessions();
          if (Array.isArray(list)) {
            setAllSessions(
              sortSessions(list.map((s) => withFallbackPath(s, activePath))),
            );
            return;
          }
        } catch {
          /* Leave the current list in place on refresh failure. */
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [token, activePath]);

  useEffect(() => {
    refreshAllSessions();
    const ws = connectWs({ baseUrl: "", token }, (msg) => {
      if (
        msg.type === NO_LOOSE_STRING_VALUES.eventAdded ||
        msg.type === NO_LOOSE_STRING_VALUES.pathSwitched ||
        msg.type === NO_LOOSE_STRING_VALUES.pathsUpdated ||
        msg.type === "session.forked" ||
        msg.type === "session.renamed"
      ) {
        refreshAllSessions();
      }
    });
    return () => {
      ws.close();
    };
  }, [token, refreshAllSessions]);

  return {
    allSessions,
    loading,
    refreshAllSessions,
    setAllSessions,
  };
}
