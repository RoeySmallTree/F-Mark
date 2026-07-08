import { useCallback, useEffect, useMemo, useState } from "react";
import type { SessionMeta } from "@f-mark/shared";
import { createClient } from "../../../api/client.js";
import { createManagedAgentsClient } from "../../../api/managedAgents.js";
import { useStore } from "../../../state/store.js";
import {
  buildPathAgentGroups,
  collectPathScopes,
  isConnectedAgent,
  type ConnectedAgentEntry,
  type PathAgentGroup,
} from "./model.js";

export interface AgentsController {
  groups: PathAgentGroup[];
  loading: boolean;
  error: string | null;
  busyAgentId: string | null;
  refresh(): Promise<void>;
  goToSession(session: SessionMeta): void;
  goodbye(entry: ConnectedAgentEntry): Promise<void>;
}

export function useAgentsController(): AgentsController {
  const token = useStore((state) => state.token);
  const setCurrentSession = useStore((state) => state.setCurrentSession);
  const closeModal = useStore((state) => state.closeModal);
  const managedAgentLiveRevision = useStore((state) => state.managedAgentLiveRevision);

  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [entries, setEntries] = useState<ConnectedAgentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAgentId, setBusyAgentId] = useState<string | null>(null);

  const api = useMemo(
    () => createManagedAgentsClient({ baseUrl: "", token }),
    [token],
  );
  const client = useMemo(
    () => createClient({ baseUrl: "", token }),
    [token],
  );

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      let nextSessions: SessionMeta[] = [];
      try {
        nextSessions = await client.listAllSessions();
      } catch {
        nextSessions = await client.listSessions();
      }
      setSessions(nextSessions);

      const pathScopes = collectPathScopes(nextSessions);
      const nextEntries: ConnectedAgentEntry[] = [];
      const seen = new Set<string>();

      for (const pathScope of pathScopes) {
        const status = await api.status(undefined, pathScope.scope);
        for (const agent of status.agents ?? []) {
          if (!isConnectedAgent(agent)) continue;
          const dedupeKey = `${pathScope.pathKey}::${agent.participant_id}`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);
          nextEntries.push({
            agent,
            scope: pathScope.scope,
            path: pathScope.path,
            pathId: pathScope.pathId,
          });
        }
      }
      setEntries(nextEntries);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [api, client]);

  useEffect(() => {
    void refresh();
  }, [refresh, managedAgentLiveRevision]);

  const groups = useMemo(
    () => buildPathAgentGroups(entries, sessions),
    [entries, sessions],
  );

  const goToSession = useCallback(
    (session: SessionMeta): void => {
      setCurrentSession(session.id, {
        path: session.path,
        path_id: session.path_id,
      });
      closeModal();
    },
    [closeModal, setCurrentSession],
  );

  const goodbye = useCallback(
    async (entry: ConnectedAgentEntry): Promise<void> => {
      const { agent, scope } = entry;
      if (
        !window.confirm(`Remove ${agent.display_name} from this session?`)
      ) {
        return;
      }
      setBusyAgentId(agent.participant_id);
      setError(null);
      try {
        const confirmToken = await api.getConfirmToken(agent.participant_id);
        await api.goodbye(agent.participant_id, confirmToken, scope);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyAgentId(null);
      }
    },
    [api, refresh],
  );

  return {
    groups,
    loading,
    error,
    busyAgentId,
    refresh,
    goToSession,
    goodbye,
  };
}
