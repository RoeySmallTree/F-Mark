import type { JSX } from "react";
import { RefreshCw, X } from "lucide-react";

interface Props {
  onRefresh(): void;
  onClose(): void;
}

export function AgentMentionHeader({
  onRefresh,
  onClose,
}: Props): JSX.Element {
  return (
    <div className="agent-mention-head">
      <span>Agents</span>
      <div>
        <button
          type="button"
          aria-label="Refresh agents"
          title="Refresh agents"
          onClick={onRefresh}
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
  );
}
