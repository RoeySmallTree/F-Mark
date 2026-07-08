import type { TodoPayload, TodoTreeNode } from "@f-mark/shared";
import type { TodoItemNode } from "../TodoItem.js";
import type { InlineDraft } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  open: "open",
} as const;

export function findTodoNode(
  nodes: TodoTreeNode[],
  id: string,
): TodoTreeNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findTodoNode(node.children, id);
    if (child !== undefined) return child;
  }
  return undefined;
}

export function nodeFromPayload(payload: TodoPayload): TodoItemNode {
  return {
    id: payload.id,
    title: payload.title,
    body: payload.body,
    status: payload.status,
    assigned_to: payload.assigned_to,
    parent_id: payload.parent_id,
    children: [],
  };
}

export function nodeFromDraft(draft: InlineDraft): TodoItemNode {
  const node: TodoItemNode = {
    id: draft.id,
    title: "",
    status: NO_LOOSE_STRING_VALUES.open,
    children: [],
  };
  if (draft.parentId !== undefined) node.parent_id = draft.parentId;
  if (draft.assignedTo !== undefined) node.assigned_to = draft.assignedTo;
  return node;
}

export function focusInlineTodo(id: string): void {
  const cards = document.querySelectorAll<HTMLElement>("[data-inline-todo-id]");
  for (const card of cards) {
    if (card.dataset.inlineTodoId !== id) continue;
    const title = card.querySelector<HTMLInputElement>("input.todo-title");
    title?.focus();
    return;
  }
}
