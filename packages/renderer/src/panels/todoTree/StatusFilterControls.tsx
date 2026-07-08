import type { JSX } from "react";
import {
  STATUS_FILTERS,
  type StatusFilterState,
  type VisibleTodoStatus,
} from "./types.js";

interface StatusFilterControlsProps {
  counts: Record<VisibleTodoStatus, number>;
  statusFilters: StatusFilterState;
  onToggleStatus: (status: VisibleTodoStatus) => void;
}

export function StatusFilterControls({
  counts,
  statusFilters,
  onToggleStatus,
}: StatusFilterControlsProps): JSX.Element {
  return (
    <div className="todo-counts" aria-label="Todo counts">
      {STATUS_FILTERS.map(({ status, label }) => (
        <button
          key={status}
          type="button"
          className="todo-count-chip"
          aria-pressed={statusFilters[status]}
          onClick={() => onToggleStatus(status)}
        >
          {label} {counts[status]}
        </button>
      ))}
    </div>
  );
}
