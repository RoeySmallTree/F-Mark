import type {
  AnyEventRecord,
  Participant,
  TodoPayload,
  TodoTreeNode,
} from "@f-mark/shared";
import type { TodoListResponse } from "../api/client.js";

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
  const allItems = [...open, ...wip, ...done];
  const toNode = (t: TodoPayload): TodoTreeNode => {
    const node: TodoTreeNode = {
      id: t.id,
      title: t.title,
      status: t.status as TodoTreeNode["status"],
      children: [],
    };
    if (t.body !== undefined) node.body = t.body;
    if (t.assigned_to !== undefined) node.assigned_to = t.assigned_to;
    if (t.parent_id !== undefined) node.parent_id = t.parent_id;
    return node;
  };
  const nodeById = new Map<string, TodoTreeNode>();
  for (const t of allItems) nodeById.set(t.id, toNode(t));
  const roots: TodoTreeNode[] = [];
  for (const t of allItems) {
    const node = nodeById.get(t.id);
    if (node === undefined) continue;
    const parent =
      t.parent_id !== undefined ? nodeById.get(t.parent_id) : undefined;
    if (parent !== undefined) parent.children.push(node);
    else roots.push(node);
  }
  return { open, wip, done, tree: roots };
}

const autoFirstReservations = new Set<string>();

export function generateTodoId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `td-${rand}`;
}

export function getAgentIds(
  participants: Record<string, Participant>,
): string[] {
  return Object.entries(participants)
    .filter(([, participant]) => participant.kind === "agent")
    .map(([id]) => id);
}

export function pickRandomAgentId(agentIds: string[]): string | undefined {
  if (agentIds.length === 0) return undefined;
  const idx = Math.floor(Math.random() * agentIds.length);
  return agentIds[idx];
}

export function titleForPost(title: string): string {
  const trimmed = title.trim();
  return trimmed.length > 0 ? trimmed : " ";
}

export function fieldValue(value: string | undefined): string {
  if (value === undefined) return "";
  return value.trim().length === 0 ? "" : value;
}

export function latestTodoFilenames(
  events: AnyEventRecord[],
): Map<string, string> {
  const latest = new Map<string, string>();
  for (const event of events) {
    if (event.kind !== "todo") continue;
    const payload = event.payload as TodoPayload;
    latest.set(payload.id, event.filename);
  }
  return latest;
}

export function countTree(nodes: TodoTreeNode[]): number {
  let total = 0;
  for (const node of nodes) {
    total += 1 + countTree(node.children);
  }
  return total;
}

export function countDescendants(node: { children: TodoTreeNode[] }): number {
  return countTree(node.children);
}

export interface FlattenedTodo {
  id: string;
  depth: number;
  parentId: string | undefined;
  prevId: string | null;
  nextId: string | null;
  prevSameDepthId: string | null;
  nextSameDepthId: string | null;
}

export interface TodoDropdownOption {
  id: string;
  title: string;
  depth: number;
}

export function flattenTree(roots: TodoTreeNode[]): FlattenedTodo[] {
  const flat: FlattenedTodo[] = [];

  function visit(
    nodes: TodoTreeNode[],
    depth: number,
    parentId: string | undefined,
  ): void {
    for (const node of nodes) {
      flat.push({
        id: node.id,
        depth,
        parentId,
        prevId: null,
        nextId: null,
        prevSameDepthId: null,
        nextSameDepthId: null,
      });
      visit(node.children, depth + 1, node.id);
    }
  }

  visit(roots, 0, undefined);

  const lastByDepth = new Map<number, FlattenedTodo>();
  for (let idx = 0; idx < flat.length; idx += 1) {
    const item = flat[idx]!;
    item.prevId = idx > 0 ? flat[idx - 1]!.id : null;
    item.nextId = idx < flat.length - 1 ? flat[idx + 1]!.id : null;
    item.prevSameDepthId = lastByDepth.get(item.depth)?.id ?? null;
    const previousAtDepth = lastByDepth.get(item.depth);
    if (previousAtDepth !== undefined) {
      previousAtDepth.nextSameDepthId = item.id;
    }
    lastByDepth.set(item.depth, item);
  }

  return flat;
}

export function flattenTreeForDropdown(
  roots: TodoTreeNode[],
): TodoDropdownOption[] {
  const flat: TodoDropdownOption[] = [];

  function visit(nodes: TodoTreeNode[], depth: number): void {
    for (const node of nodes) {
      flat.push({ id: node.id, title: node.title, depth });
      visit(node.children, depth + 1);
    }
  }

  visit(roots, 0);
  return flat;
}

export function nextIndentParentId(
  flat: FlattenedTodo[],
  selfId: string,
): string | null {
  const self = flat.find((item) => item.id === selfId);
  if (self === undefined) return null;
  for (let idx = flat.indexOf(self) - 1; idx >= 0; idx -= 1) {
    const candidate = flat[idx]!;
    if (candidate.depth === self.depth) return candidate.id;
  }
  return null;
}

export function nextOutdentParentId(
  flat: FlattenedTodo[],
  selfId: string,
): string | null | "ROOT" {
  const self = flat.find((item) => item.id === selfId);
  if (self === undefined || self.parentId === undefined) return null;
  const parent = flat.find((item) => item.id === self.parentId);
  return parent?.parentId ?? "ROOT";
}

export function reserveAutoFirstTodo(sessionId: string): boolean {
  if (autoFirstReservations.has(sessionId)) return false;
  autoFirstReservations.add(sessionId);
  return true;
}

export function releaseAutoFirstTodo(sessionId: string): void {
  autoFirstReservations.delete(sessionId);
}

export function resetAutoFirstTodoReservations(): void {
  autoFirstReservations.clear();
}
