import type { JSX } from "react";

const NO_LOOSE_STRING_VALUES = {
  subtask: "subtask",
  subtasks: "subtasks",
} as const;

interface TodoConfirmRemoveProps {
  descendants: number;
  onCancel: () => void;
  onRemove: () => Promise<void>;
}

export function TodoConfirmRemove({
  descendants,
  onCancel,
  onRemove,
}: TodoConfirmRemoveProps): JSX.Element {
  return (
    <div className="todo-confirm" role="alert">
      <span>
        Remove this task and {descendants}{" "}
        {descendants === 1 ? NO_LOOSE_STRING_VALUES.subtask : NO_LOOSE_STRING_VALUES.subtasks}?
      </span>
      <button type="button" onClick={() => void onRemove()}>
        Remove
      </button>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
