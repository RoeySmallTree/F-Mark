import type { AgentStatusRow } from "@f-mark/shared";
import { useCallback, useEffect, useState } from "react";
import type { RootScope } from "../../../../api/client.js";
import type { ManagedAgentsClient } from "../../../../api/managedAgents.js";
import { useStore } from "../../../../state/store.js";
import { errorMessage } from "./errorMessage.js";

interface UseAgentStatusListParams {
  api: ManagedAgentsClient;
  currentSessionId: string | null;
  currentScope: RootScope | null;
  scopeKey: string;
}

export function useAgentStatusList({
  api,
  currentSessionId,
  currentScope,
  scopeKey,
}: UseAgentStatusListParams) {
  const [agents, setAgents] = useState<AgentStatusRow[]>([]);
  const [removedAgents, setRemovedAgents] = useState<AgentStatusRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const managedAgentLiveRevision = useStore((s) => s.managedAgentLiveRevision);

  const refresh = useCallback(async (): Promise<void> => {
    if (currentSessionId === null && scopeKey.length === 0) {
      setAgents([]);
      setRemovedAgents([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const status = await api.status(currentSessionId ?? undefined, currentScope);
      setAgents(status.agents ?? []);
      setRemovedAgents(status.removed_agents ?? []);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [api, currentSessionId, currentScope, scopeKey]);

  useEffect(() => {
    void refresh();
  }, [refresh, managedAgentLiveRevision]);

  return { agents, removedAgents, loading, error, setError, refresh };
}
