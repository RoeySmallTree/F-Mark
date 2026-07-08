import type { JSX } from "react";
import { ParticipantAvatar } from "../../../components/ParticipantAvatar.js";
import { useStore } from "../../../state/store.js";
import { activityLabel, type ConnectedAgentEntry } from "./model.js";

const NO_LOOSE_STRING_VALUES = {
  agent: "agent",
  fallbackColor: "#888",
} as const;

interface AgentCardProps {
  entry: ConnectedAgentEntry;
  busy: boolean;
  onGoodbye(entry: ConnectedAgentEntry): void;
}

export function AgentCard({
  entry,
  busy,
  onGoodbye,
}: AgentCardProps): JSX.Element {
  const { agent } = entry;
  const participant = useStore((state) => state.participants[agent.participant_id]);
  const color = participant?.color ?? NO_LOOSE_STRING_VALUES.fallbackColor;
  return (
    <div className="agent-card" data-agent-id={agent.participant_id}>
      <ParticipantAvatar
        participantId={agent.participant_id}
        kind={NO_LOOSE_STRING_VALUES.agent}
        name={agent.display_name}
        color={color}
        runtimeId={agent.runtime_id}
        className="agent-dot"
      />
      <div className="agent-info">
        <div className="agent-name">
          {agent.display_name}
          <span className="agent-id">· {agent.participant_id}</span>
        </div>
        <div className="agent-meta">{activityLabel(agent)}</div>
      </div>
      <div className="agent-actions">
        <button
          type="button"
          className="btn-ghost agent-action-btn"
          disabled={busy}
          onClick={() => onGoodbye(entry)}
        >
          Goodbye
        </button>
      </div>
    </div>
  );
}
