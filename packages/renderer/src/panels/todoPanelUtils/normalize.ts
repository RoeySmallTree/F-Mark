import type { TodoPayload, TodoTreeNode } from "@f-mark/shared";
import type { TodoListResponse } from "../../api/client.js";
import { todoNodeFromPayload } from "./todoRecords.js";

export const EMPTY_TODOS: TodoListResponse = {
  open: [],
  wip: [],
  done: [],
  tree: [],
};

/* Defensive coercion for the /todos response. The kernel always returns
   `tree`, but a stale or restarting kernel can briefly serve a response
   without it. Falling back to an empty tree while buckets are populated
   used to manifest as "Preparing first task…" with a non-zero count.
   When `tree` is missing but buckets have items, rebuild it from
   `parent_id` so the UI still renders the work. */
export function normalizeTodos(raw: unknown): TodoListResponse {
  const value = (raw ?? {}) as Partial<TodoListResponse>;
  const open = Array.isArray(value.open) ? value.open : [];
  const wip = Array.isArray(value.wip) ? value.wip : [];
  const done = Array.isArray(value.done) ? value.done : [];
  if (Array.isArray(value.tree)) {
    return { open, wip, done, tree: value.tree };
  }
  if (open.length + wip.length + done.length === 0) {
    return { open, wip, done, tree: [] };
  }
  console.warn(
    "[todos] response missing `tree` field; deriving from buckets",
  );
  return { open, wip, done, tree: treeFromBuckets([...open, ...wip, ...done]) };
}

function treeFromBuckets(items: TodoPayload[]): TodoTreeNode[] {
  const nodeById = new Map<string, TodoTreeNode>();
  for (const item of items) nodeById.set(item.id, todoNodeFromPayload(item));
  return rootsFromBuckets(items, nodeById);
}

function rootsFromBuckets(
  items: TodoPayload[],
  nodeById: Map<string, TodoTreeNode>,
): TodoTreeNode[] {
  const roots: TodoTreeNode[] = [];
  for (const item of items) {
    const node = nodeById.get(item.id);
    if (node === undefined) continue;
    const parent =
      item.parent_id !== undefined ? nodeById.get(item.parent_id) : undefined;
    if (parent !== undefined) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}
