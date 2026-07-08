import type { TodoTreeNode } from "@f-mark/shared";
import type { TodoInputField } from "../../cards/TodoItem.js";

export interface TodoTreeListProps {
  className?: string;
  compact?: boolean;
  showCounts?: boolean;
}

export interface DraftTodo {
  id: string;
  parentId?: string;
  afterId?: string;
  assignedTo?: string;
}

export type PendingFocus =
  | { kind: "todo"; id: string; field: TodoInputField }
  | { kind: "add-row" };

export type VisibleTodoStatus = TodoTreeNode["status"];

export type StatusFilterState = Record<VisibleTodoStatus, boolean>;

export const STATUS_FILTERS: Array<{
  status: VisibleTodoStatus;
  label: string;
}> = [
  { status: "open", label: "Open" },
  { status: "wip", label: "In progress" },
  { status: "done", label: "Done" },
];

export const DEFAULT_STATUS_FILTERS: StatusFilterState = {
  open: true,
  wip: true,
  done: true,
};

export const STATUS_GROUP_RANK: Record<VisibleTodoStatus, number> = {
  wip: 0,
  open: 1,
  done: 2,
};

export const STATUS_GROUP_LABEL: Record<VisibleTodoStatus, string> = {
  wip: "In progress",
  open: "Open",
  done: "Done",
};
