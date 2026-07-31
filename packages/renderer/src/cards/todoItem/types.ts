import type { CSSProperties, KeyboardEvent, RefObject } from "react";
import type { Participant, TodoPayload, TodoTreeNode } from "@f-mark/shared";
import type { WhoInfo } from "../format.js";

export interface TodoItemNode {
  id: string;
  title: string;
  body?: string;
  status: TodoPayload["status"];
  assigned_to?: string;
  parent_id?: string;
  children: TodoTreeNode[];
}

export type TodoInputField = "title" | "body";

export interface TodoItemValues {
  title: string;
  body: string;
}

export interface TodoInputRefs {
  title: HTMLTextAreaElement;
  body: HTMLTextAreaElement;
}

export interface TodoItemMutationHandlers {
  onUpdate: (patch: Partial<TodoPayload>) => Promise<void>;
  onReassign: (
    participantId: string | null,
    values: TodoItemValues,
  ) => Promise<void>;
  onToggleDone: (values: TodoItemValues) => Promise<void>;
  onToggleWip: (values: TodoItemValues) => Promise<void>;
  onAddSubtask: (values: TodoItemValues) => Promise<void> | void;
  onRemove: (
    field?: TodoInputField,
    values?: TodoItemValues,
  ) => Promise<void>;
  /** Authoritative descendant ids from the kernel (the same cascade
   *  `writeTodoEvent` applies), used to phrase the removal confirmation.
   *  Omitted by callers that already hold an accurate full-tree count. */
  fetchDescendants?: () => Promise<string[]>;
}

export interface TodoItemNavigationHandlers {
  registerInputs?: (id: string, inputs: TodoInputRefs | null) => void;
  onIndent?: (
    field: TodoInputField,
    patch: TodoItemValues,
  ) => Promise<void> | void;
  onOutdent?: (
    field: TodoInputField,
    patch: TodoItemValues,
  ) => Promise<void> | void;
  onFocusPrev?: () => void;
  onFocusNext?: () => void;
  onCommitAndCreateBelow?: (patch: TodoItemValues) => Promise<void> | void;
}

export interface TodoItemProps
  extends TodoItemMutationHandlers,
    TodoItemNavigationHandlers {
  node: TodoItemNode;
  depth: number;
  participants: Record<string, Participant>;
  agentIds: string[];
  titlePlaceholder?: string;
  autoFocusTitle?: boolean;
  compact?: boolean;
  draft?: boolean;
  showAddSubtask?: boolean;
}

export interface TodoAssigneeOption {
  participantId: string;
  participant: Participant;
  name: string;
}

export type TodoInputKeyDown = (
  event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  field: TodoInputField,
) => void;

export interface TodoItemController {
  node: TodoItemNode;
  depth: number;
  done: boolean;
  wip: boolean;
  draft: boolean;
  showAddSubtask: boolean;
  titlePlaceholder: string;
  title: string;
  body: string;
  assignee: WhoInfo | null;
  assigneeLabel: string;
  assigneeOpen: boolean;
  participantsList: TodoAssigneeOption[];
  titleLabel: string;
  className: string;
  style: CSSProperties;
  rootRef: RefObject<HTMLDivElement>;
  titleRef: RefObject<HTMLTextAreaElement>;
  bodyRef: RefObject<HTMLTextAreaElement>;
  assigneeButtonRef: RefObject<HTMLButtonElement>;
  setTitle: (value: string) => void;
  setBody: (value: string) => void;
  skipActiveInputBlurCommit: () => void;
  commitTitle: () => Promise<void>;
  commitBody: () => Promise<void>;
  remove: () => Promise<void>;
  selectAssignee: (participantId: string | null) => Promise<void>;
  toggleDone: () => Promise<void>;
  toggleWip: () => Promise<void>;
  addSubtask: () => void;
  toggleAssigneeMenu: () => void;
  onLocalKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onInputKeyDown: TodoInputKeyDown;
}
