import type { TodoPayload, TodoTreeNode } from "@f-mark/shared";
import type { TodoListResponse } from "../../../src/api/client.js";

export type TodoPost = Record<string, unknown>;
export type TodoTreeRef = { current: TodoTreeNode[] };

export const DEFAULT_TODO_EVENT_FILENAME =
  "20260522T110000Z_us-a7f3.todo.json";
export const DEFAULT_PARTICIPANT_ID = "us-a7f3";

export function todoTreeRef(current: TodoTreeNode[]): TodoTreeRef {
  return { current };
}

export function todoListResponse(tree: TodoTreeNode[]): TodoListResponse {
  const open: TodoPayload[] = [];
  const wip: TodoPayload[] = [];
  const done: TodoPayload[] = [];

  for (const item of flattenTodoTree(tree)) {
    const payload = todoPayload(item);
    if (item.status === "open") open.push(payload);
    if (item.status === "wip") wip.push(payload);
    if (item.status === "done") done.push(payload);
  }

  return { open, wip, done, tree };
}

export const singleTree = (): TodoTreeNode[] => [
  {
    id: "t1",
    title: "Draft plan",
    body: "phase 1",
    status: "open",
    assigned_to: "ag-c92e",
    children: [],
  },
];

export const assignableTree = (): TodoTreeNode[] => [
  {
    id: "t1",
    title: "Assign task",
    status: "open",
    children: [],
  },
];

export const nestedTree = (): TodoTreeNode[] => [
  {
    id: "parent",
    title: "Parent task",
    status: "open",
    children: [
      {
        id: "child",
        title: "Child task",
        status: "open",
        parent_id: "parent",
        children: [],
      },
    ],
  },
];

export const siblingTree = (): TodoTreeNode[] => [
  {
    id: "first",
    title: "First task",
    status: "open",
    children: [],
  },
  {
    id: "second",
    title: "Second task",
    status: "open",
    children: [],
  },
];

export const mixedStatusTree = (): TodoTreeNode[] => [
  {
    id: "open-user",
    title: "Open user task",
    status: "open",
    assigned_to: "us-a7f3",
    children: [],
  },
  {
    id: "done-agent",
    title: "Done agent task",
    status: "done",
    assigned_to: "ag-c92e",
    children: [],
  },
  {
    id: "wip-agent",
    title: "WIP agent task",
    status: "wip",
    assigned_to: "ag-c92e",
    children: [],
  },
  {
    id: "open-agent",
    title: "Open agent task",
    status: "open",
    assigned_to: "ag-c92e",
    children: [],
  },
];

function flattenTodoTree(nodes: TodoTreeNode[]): TodoTreeNode[] {
  return nodes.flatMap((node) => [node, ...flattenTodoTree(node.children)]);
}

function todoPayload(node: TodoTreeNode): TodoPayload {
  return {
    id: node.id,
    title: node.title,
    status: node.status,
    ...(node.body === undefined ? {} : { body: node.body }),
    ...(node.assigned_to === undefined
      ? {}
      : { assigned_to: node.assigned_to }),
    ...(node.parent_id === undefined ? {} : { parent_id: node.parent_id }),
  };
}
