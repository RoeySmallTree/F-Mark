import type { JSX } from "react";
import { Popover } from "../../popovers/Popover.js";
import { AgentMentionEmpty } from "./AgentMentionEmpty.js";
import { AgentMentionHeader } from "./AgentMentionHeader.js";
import { AgentMentionList } from "./AgentMentionList.js";
import type {
  AgentMentionPickerController,
  AgentMentionPickerProps,
} from "./types.js";

interface Props extends AgentMentionPickerProps {
  controller: AgentMentionPickerController;
  closing?: boolean;
}

export function AgentMentionPickerView({
  anchorRect,
  selectedIds,
  onSelect,
  onClose,
  controller,
  closing = false,
}: Props): JSX.Element {
  const { agents, rows, busyId, refresh, resume, reconnect } = controller;

  return (
    <Popover
      anchorRect={anchorRect}
      placement="top-start"
      onClose={onClose}
      closing={closing}
      className="agent-mention-popover"
      ariaLabel="Agents"
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
    </Popover>
  );
}
