import { useCallback, useMemo } from "react";
import type { SessionMeta } from "@f-mark/shared";
import type { Client } from "../../api/client.js";
import { useStore } from "../../state/store.js";
import {
  applyNamespaceForSession,
  seedSession,
} from "./sessionState.js";

export interface ResolvedSessionActions {
  applySessionNamespace(session: SessionMeta): void;
  seedResolvedSession(session: SessionMeta): void;
}

export function useResolvedSessionActions(client: Client): ResolvedSessionActions {
  const applySessionNamespace = useCallback((session: SessionMeta): void => {
    const { rehydrateNamespacedSlices } = useStore.getState();
    applyNamespaceForSession(session, rehydrateNamespacedSlices);
  }, []);

  const seedResolvedSession = useCallback(
    (session: SessionMeta): void => {
      const {
        setPathsState,
        setSessions,
        setCurrentSession,
        setEvents,
      } = useStore.getState();
      seedSession({
        client,
        session,
        setPathsState,
        setSessions,
        setCurrentSession,
        setEvents,
      });
    },
    [client],
  );

  return useMemo(
    () => ({ applySessionNamespace, seedResolvedSession }),
    [applySessionNamespace, seedResolvedSession],
  );
}
