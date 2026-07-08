import type { Participant, TodoTreeNode } from "@f-mark/shared";
import type { TodoListResponse } from "../../api/client.js";
import type { TodoItemNode } from "../../cards/TodoItem.js";
import { whoOf } from "../../cards/format.js";
import {
  STATUS_GROUP_RANK,
  type DraftTodo,
  type StatusFilterState,
  type VisibleTodoStatus,
} from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  open: "open",
  unassigned: "unassigned",
  unassigned2: "Unassigned",
} as const;

export function depthOffset(depth: number): string {
  if (depth <= 0) return "0px";
  return `calc(${Array.from({ length: depth }, () => "var(--todo-indent-step)").join(" + ")})`;
}

export function draftNode(draft: DraftTodo): TodoItemNode {
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

export function nodeForItem(node: TodoTreeNode): TodoItemNode {
  return {
    id: node.id,
    title: node.title,
    body: node.body,
    status: node.status,
    assigned_to: node.assigned_to,
    parent_id: node.parent_id,
    children: node.children,
  };
}

export function collectNodeMap(
  nodes: TodoTreeNode[],
): Map<string, TodoTreeNode> {
  const map = new Map<string, TodoTreeNode>();
  const visit = (items: TodoTreeNode[]): void => {
    for (const item of items) {
      map.set(item.id, item);
      visit(item.children);
    }
  };
  visit(nodes);
  return map;
}

export function createFlatById<T extends { id: string }>(
  flat: T[],
): Map<string, T> {
  return new Map(flat.map((item) => [item.id, item]));
}

export function todoCounts(
  todos: TodoListResponse,
): Record<VisibleTodoStatus, number> {
  return {
    open: todos.open.length,
    wip: todos.wip.length,
    done: todos.done.length,
  };
}

export function todoGroupKey(node: TodoTreeNode): string {
  return `${node.status}:${node.assigned_to ?? NO_LOOSE_STRING_VALUES.unassigned}`;
}

export function todoAssigneeLabel(
  node: TodoTreeNode,
  participants: Record<string, Participant>,
): string {
  if (node.assigned_to === undefined) return NO_LOOSE_STRING_VALUES.unassigned2;
  return whoOf(node.assigned_to, participants).name;
}

function assigneeSortKey(
  node: TodoTreeNode,
  participants: Record<string, { name: string }>,
): string {
  if (node.assigned_to === undefined) return "\uffff";
  return (
    participants[node.assigned_to]?.name.toLocaleLowerCase() ??
    node.assigned_to
  );
}

function orderSiblings(
  nodes: TodoTreeNode[],
  participants: Record<string, { name: string }>,
): TodoTreeNode[] {
  return nodes
    .map((node, index) => ({ node, index }))
    .sort((a, b) => {
      const status =
        STATUS_GROUP_RANK[a.node.status] - STATUS_GROUP_RANK[b.node.status];
      if (status !== 0) return status;
      const assignee = assigneeSortKey(a.node, participants).localeCompare(
        assigneeSortKey(b.node, participants),
      );
      if (assignee !== 0) return assignee;
      return a.index - b.index;
    })
    .map(({ node }) => node);
}

export function visibleOrderedTree(
  nodes: TodoTreeNode[],
  filters: StatusFilterState,
  participants: Record<string, { name: string }>,
): TodoTreeNode[] {
  const visible: TodoTreeNode[] = [];
  for (const node of orderSiblings(nodes, participants)) {
    const children = visibleOrderedTree(node.children, filters, participants);
    if (filters[node.status]) {
      visible.push({ ...node, children });
    } else {
      visible.push(...children);
    }
  }
  return visible;
}
