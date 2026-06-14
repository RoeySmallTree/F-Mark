import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type JSX,
} from "react";
import { Play, RefreshCw, RotateCw, X } from "lucide-react";
import type {
  AgentConnectionState,
  AgentStatusRow,
  Participant,
  ProseMention,
} from "@f-mark/shared";
import { createManagedAgentsClient } from "../api/managedAgents.js";

interface MentionRow extends ProseMention {
  connectionState: AgentConnectionState;
  managed: boolean;
  paused: boolean;
}

interface Props {
  anchorRect: DOMRect;
  sessionId: string | null;
  token: string | null;
  participants: Record<string, Participant>;
  selectedIds: Set<string>;
  onSelect(mention: ProseMention): void;
  onClose(): void;
}

function mentionToken(displayName: string): string {
  return `@${displayName}`;
}

function rowFromStatus(agent: AgentStatusRow): MentionRow {
  return {
    participant_id: agent.participant_id,
    display_name: agent.display_name,
    token: mentionToken(agent.display_name),
    paused: agent.paused,
    connectionState: agent.connection_state,
    managed: agent.managed,
  };
}

function rowFromParticipant(id: string, participant: Participant): MentionRow {
  return {
    participant_id: id,
    display_name: participant.name,
    token: mentionToken(participant.name),
    paused: false,
    connectionState: "connected",
    managed: false,
  };
}

function rowStatus(row: MentionRow): string {
  if (row.paused) return "Paused";
  if (row.connectionState === "connected") return "Connected";
  if (row.connectionState === "detached") return "Detached";
  if (row.connectionState === "launching") return "Launching";
  return "Offline";
}

export function AgentMentionPicker({
  anchorRect,
  sessionId,
  token,
  participants,
  selectedIds,
  onSelect,
  onClose,
}: Props): JSX.Element {
  const [agents, setAgents] = useState<AgentStatusRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (sessionId === null) {
      setAgents([]);
      return;
    }
    const client = createManagedAgentsClient({ baseUrl: "", token });
    const status = await client.status(sessionId);
    setAgents(status.agents);
  }, [sessionId, token]);

  useEffect(() => {
    void refresh().catch(() => {
      setAgents([]);
    });
  }, [anchorRect, refresh]);

  const rows = useMemo(() => {
    const byId = new Map<string, MentionRow>();
    for (const agent of agents ?? []) {
      if (agent.active_session !== sessionId || !agent.managed) continue;
      byId.set(agent.participant_id, rowFromStatus(agent));
    }
    for (const [id, participant] of Object.entries(participants)) {
      if (
        participant.kind !== "agent" ||
        participant.active_session !== sessionId ||
        byId.has(id)
      ) {
        continue;
      }
      byId.set(id, rowFromParticipant(id, participant));
    }
    return [...byId.values()].sort((a, b) =>
      a.display_name.localeCompare(b.display_name),
    );
  }, [agents, participants, sessionId]);

  async function resume(row: MentionRow): Promise<void> {
    const client = createManagedAgentsClient({ baseUrl: "", token });
    setBusyId(row.participant_id);
    try {
      await client.resume(row.participant_id);
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function reconnect(row: MentionRow): Promise<void> {
    const client = createManagedAgentsClient({ baseUrl: "", token });
    setBusyId(row.participant_id);
    try {
      await client.reconnect(row.participant_id);
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div
      className="agent-mention-popover"
      style={{
        position: "fixed",
        left: Math.min(
          Math.max(8, anchorRect.left),
          Math.max(8, window.innerWidth - 336),
        ),
        bottom: Math.max(8, window.innerHeight - anchorRect.top + 8),
      }}
    >
      <div className="agent-mention-head">
        <span>Agents</span>
        <div>
          <button
            type="button"
            aria-label="Refresh agents"
            title="Refresh agents"
            onClick={() => void refresh()}
          >
            <RefreshCw size={13} aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Close agents"
            title="Close"
            onClick={onClose}
          >
            <X size={13} aria-hidden />
          </button>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="agent-mention-empty">
          {agents === null ? "Loading agents" : "No session agents"}
        </div>
      ) : (
        <div className="agent-mention-list">
          {rows.map((row) => {
            const selected = selectedIds.has(row.participant_id);
            const selectable =
              !row.paused && row.connectionState === "connected";
            const canReconnect =
              !row.paused &&
              (row.connectionState === "detached" ||
                row.connectionState === "offline");
            return (
              <div
                key={row.participant_id}
                className={[
                  "agent-mention-row",
                  selected ? "selected" : "",
                  selectable ? "" : "disabled",
                ]
                  .join(" ")
                  .trim()}
              >
                <button
                  type="button"
                  className="agent-mention-choice"
                  onClick={() => onSelect(row)}
                  disabled={!selectable && !selected}
                  aria-pressed={selected}
                >
                  <span>{row.display_name}</span>
                  <code>{row.participant_id}</code>
                </button>
                <span className="agent-mention-status">{rowStatus(row)}</span>
                {row.paused ? (
                  <button
                    type="button"
                    className="agent-mention-action"
                    disabled={busyId !== null}
                    onClick={() => void resume(row)}
                    title="Resume agent"
                    aria-label={`Resume ${row.display_name}`}
                  >
                    <Play size={12} aria-hidden />
                    Resume
                  </button>
                ) : canReconnect ? (
                  <button
                    type="button"
                    className="agent-mention-action"
                    disabled={busyId !== null}
                    onClick={() => void reconnect(row)}
                    title="Reconnect agent"
                    aria-label={`Reconnect ${row.display_name}`}
                  >
                    <RotateCw size={12} aria-hidden />
                    Reconnect
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
