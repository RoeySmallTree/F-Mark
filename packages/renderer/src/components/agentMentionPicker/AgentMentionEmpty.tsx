import type { JSX } from "react";

interface Props {
  loading: boolean;
}

export function AgentMentionEmpty({ loading }: Props): JSX.Element {
  return (
    <div className="agent-mention-empty">
      {loading ? "Loading agents" : "No session agents"}
    </div>
  );
}
