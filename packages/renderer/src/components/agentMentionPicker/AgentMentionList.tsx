import type { JSX } from "react";
import type { ProseMention } from "@f-mark/shared";
import { AgentMentionRow } from "./AgentMentionRow.js";
import type { MentionRow } from "./types.js";

interface Props {
  rows: MentionRow[];
  selectedIds: Set<string>;
  busyId: string | null;
  onSelect(mention: ProseMention): void;
  onResume(row: MentionRow): void;
  onReconnect(row: MentionRow): void;
}

export function AgentMentionList({
  rows,
  selectedIds,
  busyId,
  onSelect,
  onResume,
  onReconnect,
}: Props): JSX.Element {
  return (
    <div className="agent-mention-list">
      {rows.map((row) => (
        <AgentMentionRow
          key={row.participant_id}
          row={row}
          selected={selectedIds.has(row.participant_id)}
          actionsDisabled={busyId !== null}
          onSelect={onSelect}
          onResume={onResume}
          onReconnect={onReconnect}
        />
      ))}
    </div>
  );
}
