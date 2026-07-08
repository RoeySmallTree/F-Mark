import type { JSX, RefObject } from "react";
import { User } from "lucide-react";
import type { WhoInfo } from "../format.js";
import { ParticipantAvatar } from "../../components/ParticipantAvatar.js";
import type { TodoAssigneeOption } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  user: "user",
  agent: "agent",
  sm: "sm",
} as const;

interface TodoAssigneeControlProps {
  assignee: WhoInfo | null;
  assigneeButtonRef: RefObject<HTMLButtonElement>;
  assigneeLabel: string;
  assigneeOpen: boolean;
  participantsList: TodoAssigneeOption[];
  onSelectAssignee: (participantId: string | null) => Promise<void>;
  onToggleAssigneeMenu: () => void;
}

export function TodoAssigneeControl({
  assignee,
  assigneeButtonRef,
  assigneeLabel,
  assigneeOpen,
  participantsList,
  onSelectAssignee,
  onToggleAssigneeMenu,
}: TodoAssigneeControlProps): JSX.Element {
  return (
    <div className="todo-assignee">
      <button
        ref={assigneeButtonRef}
        type="button"
        className={[
          "assign-badge",
          "icon-only",
          assignee === null ? "unassigned" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-haspopup="menu"
        aria-expanded={assigneeOpen}
        aria-label={assigneeLabel}
        title={assigneeLabel}
        onClick={onToggleAssigneeMenu}
      >
        {assignee !== null ? (
          <ParticipantAvatar
            participantId={assignee.id}
            kind={assignee.isUser ? NO_LOOSE_STRING_VALUES.user : NO_LOOSE_STRING_VALUES.agent}
            name={assignee.name}
            color={assignee.color}
            runtimeId={assignee.runtimeId}
            size={NO_LOOSE_STRING_VALUES.sm}
          />
        ) : (
          <User size={13} aria-hidden />
        )}
      </button>
      {assigneeOpen ? (
        <TodoAssigneeMenu
          participantsList={participantsList}
          onSelectAssignee={onSelectAssignee}
        />
      ) : null}
    </div>
  );
}

interface TodoAssigneeMenuProps {
  participantsList: TodoAssigneeOption[];
  onSelectAssignee: (participantId: string | null) => Promise<void>;
}

function TodoAssigneeMenu({
  participantsList,
  onSelectAssignee,
}: TodoAssigneeMenuProps): JSX.Element {
  return (
    <div className="todo-assignee-menu" role="menu">
      <button
        type="button"
        role="menuitem"
        className="todo-assignee-option"
        onClick={() => void onSelectAssignee(null)}
      >
        <span className="avatar sm ghost" aria-hidden>
          -
        </span>
        Unassign
      </button>
      {participantsList.map(({ participantId, participant, name }) => (
        <button
          key={participantId}
          type="button"
          role="menuitem"
          className="todo-assignee-option"
          onClick={() => void onSelectAssignee(participantId)}
        >
          <ParticipantAvatar
            participantId={participantId}
            participant={participant}
            kind={participant.kind}
            name={name}
            color={participant.color}
            runtimeId={participant.runtime_id ?? null}
            size={NO_LOOSE_STRING_VALUES.sm}
          />
          {name}
        </button>
      ))}
    </div>
  );
}
