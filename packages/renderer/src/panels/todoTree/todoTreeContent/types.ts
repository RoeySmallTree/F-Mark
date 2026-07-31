import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from "react";
import type { Participant, TodoPayload, TodoTreeNode } from "@f-mark/shared";
import type {
  TodoInputField,
  TodoInputRefs,
  TodoItemValues,
} from "../../../cards/TodoItem.js";
import type { FlattenedTodo } from "../../todoPanelUtils.js";
import type { DraftTodo, PendingFocus } from "../types.js";

export interface TodoTreeContentProps {
  nodes: TodoTreeNode[];
  allNodeById: Map<string, TodoTreeNode>;
  draft: DraftTodo | null;
  setDraft: Dispatch<SetStateAction<DraftTodo | null>>;
  participants: Record<string, Participant>;
  agentIds: string[];
  compact: boolean;
  flat: FlattenedTodo[];
  flatById: Map<string, FlattenedTodo>;
  pendingFocusRef: MutableRefObject<PendingFocus | null>;
  registerInputs: (id: string, inputs: TodoInputRefs | null) => void;
  focusTodo: (id: string, field?: TodoInputField) => boolean;
  updateExisting: (
    node: TodoTreeNode,
    patch: Partial<TodoPayload>,
    assignedTo?: string | null,
  ) => Promise<boolean>;
  createDraft: (
    currentDraft: DraftTodo,
    patch: Partial<TodoPayload>,
  ) => Promise<boolean>;
  /** Authoritative descendant ids from the kernel (the same cascade
   *  `writeTodoEvent` applies), used to phrase the removal confirmation. */
  fetchDescendants: (todoId: string) => Promise<string[]>;
}

export type TodoTreeActionDeps = Pick<
  TodoTreeContentProps,
  | "agentIds"
  | "createDraft"
  | "fetchDescendants"
  | "flat"
  | "flatById"
  | "focusTodo"
  | "pendingFocusRef"
  | "setDraft"
  | "updateExisting"
>;

export interface TodoTreeActions {
  createDraft: TodoTreeContentProps["createDraft"];
  updateExisting: TodoTreeContentProps["updateExisting"];
  fetchDescendants: TodoTreeContentProps["fetchDescendants"];
  clearDraft: () => void;
  commitDraftAndCreateBelow: (
    currentDraft: DraftTodo,
    patch: TodoItemValues,
  ) => Promise<void>;
  commitExistingAndCreateBelow: (
    node: TodoTreeNode,
    patch: TodoItemValues,
  ) => Promise<void>;
  createChildDraftFromDraft: (
    currentDraft: DraftTodo,
    values: TodoItemValues,
  ) => Promise<void>;
  focusNextTodo: (id: string) => void;
  focusPreviousDraft: (currentDraft: DraftTodo) => void;
  focusPreviousTodo: (id: string) => void;
  indentDraft: (currentDraft: DraftTodo, depth: number) => void;
  indentTodo: (
    node: TodoTreeNode,
    field: TodoInputField,
    values: TodoItemValues,
  ) => Promise<void>;
  outdentDraft: (currentDraft: DraftTodo) => void;
  outdentTodo: (
    node: TodoTreeNode,
    field: TodoInputField,
    values: TodoItemValues,
  ) => Promise<void>;
  removeTodo: (
    node: TodoTreeNode,
    field?: TodoInputField,
    values?: TodoItemValues,
  ) => Promise<void>;
  startChildDraft: (parentId: string) => void;
  updateDraftAssignee: (
    currentDraft: DraftTodo,
    participantId: string | null,
  ) => void;
}
