import type { JSX } from "react";
import type { ProseMention } from "@f-mark/shared";
import { Play, RotateCw } from "lucide-react";
import {
  canReconnectRow,
  isRowSelectable,
  rowStatus,
} from "./model.js";
import type { MentionRow } from "./types.js";

interface Props {
  row: MentionRow;
  selected: boolean;
  actionsDisabled: boolean;
  onSelect(mention: ProseMention): void;
  onResume(row: MentionRow): void;
  onReconnect(row: MentionRow): void;
}

export function AgentMentionRow({
  row,
  selected,
  actionsDisabled,
  onSelect,
  onResume,
  onReconnect,
}: Props): JSX.Element {
  const selectable = isRowSelectable(row);
  const canReconnect = canReconnectRow(row);
  const status = rowStatus(row);

  return (
    <div
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
      <span className="agent-mention-status" data-status={status.toLowerCase()}>
        {status}
      </span>
      {row.paused ? (
        <button
          type="button"
          className="agent-mention-action"
          disabled={actionsDisabled}
          onClick={() => onResume(row)}
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
          disabled={actionsDisabled}
          onClick={() => onReconnect(row)}
          title="Reconnect agent"
          aria-label={`Reconnect ${row.display_name}`}
        >
          <RotateCw size={12} aria-hidden />
          Reconnect
        </button>
      ) : null}
    </div>
  );
}
