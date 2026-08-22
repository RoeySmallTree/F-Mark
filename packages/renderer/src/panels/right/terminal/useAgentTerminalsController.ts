import { useCallback, useEffect, useMemo, useState } from "react";
import type { AgentStatusRow, ManagedAgent, Participant } from "@f-mark/shared";
import { createManagedAgentsClient } from "../../../api/managedAgents.js";
import { useCurrentSessionRootScopeBinding } from "../../../hooks/useCurrentSessionRootScope.js";
import { useStore } from "../../../state/store.js";
import {
  setActiveAgentTerminal,
  useActiveAgentTmux,
} from "../../../state/terminalPaneState.js";

const NO_LOOSE_STRING_VALUES = {
  connected: "connected",
} as const;

export interface AgentTerminal {
  tmux_session: string;
  participant_id: string;
  label: string;
  alive: boolean;
}

export interface AgentTerminalsController {
  agents: AgentTerminal[];
  hasSessionAgents: boolean;
  active: string | null;
  /** Agent sessions activated at least once → mounted (keep-alive). */
  mountedSessions: string[];
  token: string | null;
  error: string | null;
  select(tmux: string): void;
  close(agent: AgentTerminal): void;
}

/* Agent terminals are the live tmux sessions of the project's managed agents
   (each agent's own CLI pane). Derived from the store — they rehydrate on load
   exactly like the agents list, so this view persists across reloads too. No
   spawn/close here: agents are created and ended through the agent lifecycle. */
export function useAgentTerminalsController(): AgentTerminalsController {
  const managedAgents = useStore((s) => s.managedAgents);
  const participants = useStore((s) => s.participants);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const token = useStore((s) => s.token);
  const activeAgentTmux = useActiveAgentTmux();
  const { scope: currentScope, scopeKey } = useCurrentSessionRootScopeBinding(currentSessionId);
  const managedAgentLiveRevision = useStore((s) => s.managedAgentLiveRevision);
  const api = useMemo(
    () => createManagedAgentsClient({ baseUrl: "", token }),
    [token],
  );
  const [scopedAgents, setScopedAgents] = useState<{
    sessionId: string;
    agents: ManagedAgent[];
    agentCount: number;
  } | null>(null);
  const [scopedStatusFailedFor, setScopedStatusFailedFor] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (currentSessionId === null) {
      setScopedAgents(null);
      setScopedStatusFailedFor(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const status = await api.status(currentSessionId, currentScope);
        if (cancelled) return;
        setScopedAgents({
          sessionId: currentSessionId,
          agents: managedAgentsFromStatusRows(status.agents ?? []),
          agentCount:
            (status.agents ?? []).length + (status.removed_agents ?? []).length,
        });
        setScopedStatusFailedFor(null);
      } catch (err) {
        if (cancelled) return;
        setScopedStatusFailedFor(currentSessionId);
        console.warn("load scoped agent terminals failed", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [api, scopeKey, currentSessionId, managedAgentLiveRevision]);

  const scopedAgentsForCurrent =
    scopedAgents?.sessionId === currentSessionId ? scopedAgents.agents : null;
  const terminalSourceAgents =
    currentSessionId === null ||
    (scopedAgentsForCurrent === null &&
      scopedStatusFailedFor === currentSessionId)
      ? managedAgents
      : (scopedAgentsForCurrent ?? []);

  const agents = useMemo<AgentTerminal[]>(
    () => buildAgentTerminals(terminalSourceAgents, participants, currentSessionId),
    [currentSessionId, participants, terminalSourceAgents],
  );

  const active = resolveActiveAgentTerminal(activeAgentTmux, agents);
  const hasSessionAgents =
    scopedAgents?.sessionId === currentSessionId
      ? scopedAgents.agentCount > 0
      : agents.length > 0;

  const [mounted, setMounted] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (active === null) return;
    const activeAgent = agents.find((agent) => agent.tmux_session === active);
    if (activeAgent === undefined || !activeAgent.alive) return;
    setMounted((prev) => (prev.has(active) ? prev : new Set(prev).add(active)));
  }, [active, agents]);

  // Drop mounted entries whose agent terminal no longer exists.
  useEffect(() => {
    setMounted((prev) => {
      let changed = false;
      const live = new Set<string>();
      for (const s of prev) {
        if (agents.some((a) => a.tmux_session === s)) live.add(s);
        else changed = true;
      }
      return changed ? live : prev;
    });
  }, [agents]);

  const select = useCallback((tmux: string): void => {
    setActiveAgentTerminal(tmux);
    const agent = agents.find((item) => item.tmux_session === tmux);
    if (agent?.alive !== true) return;
    setMounted((prev) => (prev.has(tmux) ? prev : new Set(prev).add(tmux)));
  }, [agents]);

  const close = useCallback(
    (agent: AgentTerminal): void => {
      setError(null);
      setMounted((prev) => {
        if (!prev.has(agent.tmux_session)) return prev;
        const next = new Set(prev);
        next.delete(agent.tmux_session);
        return next;
      });
      if (activeAgentTmux === agent.tmux_session) setActiveAgentTerminal(null);
    },
    [activeAgentTmux],
  );

  const mountedSessions = useMemo(
    () =>
      agents
        .filter((a) => a.alive && mounted.has(a.tmux_session))
        .map((a) => a.tmux_session),
    [agents, mounted],
  );

  return {
    agents,
    hasSessionAgents,
    active,
    mountedSessions,
    token,
    error,
    select,
    close,
  };
}

export function managedAgentsFromStatusRows(
  rows: AgentStatusRow[],
): ManagedAgent[] {
  return rows.map((row) => ({
    participant_id: row.participant_id,
    display_name: row.display_name,
    tmux_session: row.tmux_session,
    runtime_id: row.runtime_id,
    active_session: row.active_session,
    membership_session_id: row.membership_session_id,
    membership_state: row.membership_state,
    pane_lifecycle: row.pane_lifecycle,
    controllable: row.controllable,
    removed_at: row.removed_at,
    removed_reason: row.removed_reason,
    runtime_session: row.runtime_session,
    alive: row.connection_state === NO_LOOSE_STRING_VALUES.connected,
    activity_state: row.activity_state,
    runtime_state: row.runtime_state,
    access_mode: row.access.mode,
  }));
}

export function resolveActiveAgentTerminal(
  requestedTmux: string | null,
  agents: AgentTerminal[],
): string | null {
  if (
    requestedTmux !== null &&
    agents.some((agent) => agent.tmux_session === requestedTmux)
  ) {
    return requestedTmux;
  }
  return (
    agents.find((agent) => agent.alive)?.tmux_session ??
    agents[0]?.tmux_session ??
    null
  );
}

export function buildAgentTerminals(
  managedAgents: ManagedAgent[],
  participants: Record<string, Participant>,
  currentSessionId: string | null,
): AgentTerminal[] {
  return managedAgents
    .filter((agent) => agent.tmux_session !== null)
    .filter((agent) => {
      if (currentSessionId === null) return true;
      const activeSession =
        agent.active_session ?? participants[agent.participant_id]?.active_session;
      return activeSession === currentSessionId;
    })
    .map((agent) => ({
      tmux_session: agent.tmux_session as string,
      participant_id: agent.participant_id,
      label:
        agent.display_name ??
        participants[agent.participant_id]?.name ??
        agent.participant_id,
      alive: agent.alive === true,
    }))
    .sort((x, y) => x.label.localeCompare(y.label));
}
