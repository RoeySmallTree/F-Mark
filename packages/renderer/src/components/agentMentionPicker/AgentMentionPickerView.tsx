import type { JSX } from "react";
import { AgentMentionEmpty } from "./AgentMentionEmpty.js";
import { AgentMentionHeader } from "./AgentMentionHeader.js";
import { AgentMentionList } from "./AgentMentionList.js";
import { getMentionPickerStyle } from "./position.js";
import type {
  AgentMentionPickerController,
  AgentMentionPickerProps,
} from "./types.js";

interface Props extends AgentMentionPickerProps {
  controller: AgentMentionPickerController;
}

export function AgentMentionPickerView({
  anchorRect,
  selectedIds,
  onSelect,
  onClose,
  controller,
}: Props): JSX.Element {
  const { agents, rows, busyId, refresh, resume, reconnect } = controller;

  return (
    <div
      className="agent-mention-popover"
      style={getMentionPickerStyle(anchorRect)}
    >
      <AgentMentionHeader
        onRefresh={() => void refresh()}
        onClose={onClose}
      />
      {rows.length === 0 ? (
        <AgentMentionEmpty loading={agents === null} />
      ) : (
        <AgentMentionList
          rows={rows}
          selectedIds={selectedIds}
          busyId={busyId}
          onSelect={onSelect}
          onResume={(row) => void resume(row)}
          onReconnect={(row) => void reconnect(row)}
        />
      )}
    </div>
  );
}
