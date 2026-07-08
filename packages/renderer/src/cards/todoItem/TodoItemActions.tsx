import type { JSX, RefObject } from "react";
import { CircleDot, CornerDownRight, Plus, X } from "lucide-react";
import type { WhoInfo } from "../format.js";
import { TodoAssigneeControl } from "./TodoAssigneeControl.js";
import type { TodoAssigneeOption } from "./types.js";

interface TodoItemActionsProps {
  assignee: WhoInfo | null;
  assigneeButtonRef: RefObject<HTMLButtonElement>;
  assigneeLabel: string;
  assigneeOpen: boolean;
  participantsList: TodoAssigneeOption[];
  showAddSubtask: boolean;
  titleLabel: string;
  wip: boolean;
  onAddSubtask: () => void;
  onRemove: () => Promise<void>;
  onSelectAssignee: (participantId: string | null) => Promise<void>;
  onSkipActiveInputBlurCommit: () => void;
  onToggleAssigneeMenu: () => void;
  onToggleWip: () => Promise<void>;
}

export function TodoItemActions({
  assignee,
  assigneeButtonRef,
  assigneeLabel,
  assigneeOpen,
  participantsList,
  showAddSubtask,
  titleLabel,
  wip,
  onAddSubtask,
  onRemove,
  onSelectAssignee,
  onSkipActiveInputBlurCommit,
  onToggleAssigneeMenu,
  onToggleWip,
}: TodoItemActionsProps): JSX.Element {
  return (
    <div className="todo-options-row">
      <div className="todo-actions" role="group" aria-label="Task actions">
        {wip ? (
          <span
            className="todo-status-pill wip"
            aria-hidden="true"
            title="In progress"
          >
            ●
          </span>
        ) : null}
        <TodoAssigneeControl
          assignee={assignee}
          assigneeButtonRef={assigneeButtonRef}
          assigneeLabel={assigneeLabel}
          assigneeOpen={assigneeOpen}
          participantsList={participantsList}
          onSelectAssignee={onSelectAssignee}
          onToggleAssigneeMenu={onToggleAssigneeMenu}
        />
        <button
          type="button"
          className={["todo-icon-btn", "todo-wip-btn", wip ? "active" : ""]
            .filter(Boolean)
            .join(" ")}
          aria-pressed={wip}
          aria-label={wip ? "Mark as open" : "Mark as in progress"}
          title={wip ? "Mark as open" : "Mark as in progress"}
          onMouseDown={onSkipActiveInputBlurCommit}
          onClick={() => {
            void onToggleWip();
          }}
        >
          <CircleDot size={13} aria-hidden />
        </button>
        {showAddSubtask ? (
          <button
            type="button"
            className="todo-icon-btn"
            aria-label={`Add subtask to ${titleLabel}`}
            title="Add subtask"
            onMouseDown={onSkipActiveInputBlurCommit}
            onClick={onAddSubtask}
          >
            <CornerDownRight size={13} aria-hidden />
            <Plus size={12} aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
          className="todo-icon-btn danger"
          aria-label={`Remove task ${titleLabel}`}
          title="Remove"
          onMouseDown={onSkipActiveInputBlurCommit}
          onClick={() => {
            void onRemove();
          }}
        >
          <X size={13} aria-hidden />
        </button>
      </div>
    </div>
  );
}
