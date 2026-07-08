import { useCallback, useEffect, useMemo, useState } from "react";
import type { AgentStatusRow } from "@f-mark/shared";
import { createManagedAgentsClient } from "../../api/managedAgents.js";
import { useCurrentSessionRootScope } from "../../hooks/useCurrentSessionRootScope.js";
import { buildMentionRows } from "./model.js";
import type {
  AgentMentionPickerController,
  AgentMentionPickerProps,
  MentionRow,
} from "./types.js";

export function useAgentMentionPickerController({
  anchorRect,
  sessionId,
  token,
  participants,
}: AgentMentionPickerProps): AgentMentionPickerController {
  const [agents, setAgents] = useState<AgentStatusRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /* Rows are filtered to this session's agents, so its root scope targets the
     agent's own project on resume/reconnect. */
  const scope = useCurrentSessionRootScope(sessionId);

  const refresh = useCallback(async (): Promise<void> => {
    if (sessionId === null) {
      setAgents([]);
      return;
    }
    const client = createManagedAgentsClient({ baseUrl: "", token });
    const status = await client.status(sessionId, scope);
    setAgents(status.agents);
  }, [scope, sessionId, token]);

  useEffect(() => {
    void refresh().catch(() => {
      setAgents([]);
    });
  }, [anchorRect, refresh]);

  const rows = useMemo(
    () => buildMentionRows({ agents, participants, sessionId }),
    [agents, participants, sessionId],
  );

  const resume = useCallback(
    async (row: MentionRow): Promise<void> => {
      const client = createManagedAgentsClient({ baseUrl: "", token });
      setBusyId(row.participant_id);
      try {
        await client.resume(row.participant_id, scope);
        await refresh();
      } finally {
        setBusyId(null);
      }
    },
    [refresh, scope, token],
  );

  const reconnect = useCallback(
    async (row: MentionRow): Promise<void> => {
      const client = createManagedAgentsClient({ baseUrl: "", token });
      setBusyId(row.participant_id);
      try {
        await client.reconnect(row.participant_id, scope);
        await refresh();
      } finally {
        setBusyId(null);
      }
    },
    [refresh, scope, token],
  );

  return {
    agents,
    rows,
    busyId,
    refresh,
    resume,
    reconnect,
  };
}
