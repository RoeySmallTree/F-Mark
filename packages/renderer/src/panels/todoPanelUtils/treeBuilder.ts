import type {
  AnyEventRecord,
  TodoPayload,
  TodoTreeNode,
} from "@f-mark/shared";
import {
  isVisibleTodo,
  sortedTodoEvents,
  supersededTodoFilenames,
  todoNodeFromPayload,
} from "./todoRecords.js";

const TODO_STATUS_RANK: Record<TodoTreeNode["status"], number> = {
  wip: 0,
  open: 1,
  done: 2,
};

export function buildTodoTreeFromEvents(
  events: AnyEventRecord[],
): TodoTreeNode[] {
  return new TodoTreeBuilder(events).build();
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

class TodoTreeBuilder {
  private readonly createdAtById = new Map<string, string>();
  private readonly latestById = new Map<string, TodoPayload>();
  private readonly nodeById = new Map<string, TodoTreeNode>();
  private readonly payloadById = new Map<string, TodoPayload>();

  constructor(private readonly events: AnyEventRecord[]) {}

  build(): TodoTreeNode[] {
    this.collectLatestPayloads();
    this.collectVisibleNodes();
    return this.sortedRoots();
  }

  private collectLatestPayloads(): void {
    const todoEvents = sortedTodoEvents(this.events);
    const superseded = supersededTodoFilenames(todoEvents);
    for (const event of todoEvents) {
      const payload = event.payload as TodoPayload;
      if (typeof payload.id !== "string" || payload.id.length === 0) continue;
      this.rememberCreatedAt(payload.id, event.timestamp);
      if (!superseded.has(event.filename)) this.latestById.set(payload.id, payload);
    }
  }

  private rememberCreatedAt(id: string, timestamp: string): void {
    const createdAt = this.createdAtById.get(id);
    if (createdAt === undefined || timestamp < createdAt) {
      this.createdAtById.set(id, timestamp);
    }
  }

  private collectVisibleNodes(): void {
    for (const payload of this.latestById.values()) {
      if (!isVisibleTodo(payload)) continue;
      if (this.hasHiddenAncestor(payload)) continue;
      this.nodeById.set(payload.id, todoNodeFromPayload(payload));
      this.payloadById.set(payload.id, payload);
    }
  }

  private sortedRoots(): TodoTreeNode[] {
    const roots = this.linkNodes();
    this.sortNodes(roots);
    return roots;
  }

  private linkNodes(): TodoTreeNode[] {
    const roots: TodoTreeNode[] = [];
    for (const payload of this.payloadById.values()) {
      const node = this.nodeById.get(payload.id);
      if (node === undefined) continue;
      const parent = this.parentNode(payload);
      if (parent === undefined) roots.push(node);
      else parent.children.push(node);
    }
    return roots;
  }

  private parentNode(payload: TodoPayload): TodoTreeNode | undefined {
    if (payload.parent_id === undefined) return undefined;
    if (this.wouldCreateCycle(payload.id, payload.parent_id)) return undefined;
    return this.nodeById.get(payload.parent_id);
  }

  private hasHiddenAncestor(payload: TodoPayload): boolean {
    const seen = new Set<string>();
    let parentId = payload.parent_id;
    while (parentId !== undefined) {
      if (seen.has(parentId)) return false;
      seen.add(parentId);
      const parent = this.latestById.get(parentId);
      if (parent === undefined) return false;
      if (!isVisibleTodo(parent)) return true;
      parentId = parent.parent_id;
    }
    return false;
  }

  private wouldCreateCycle(id: string, parentId: string): boolean {
    const seen = new Set<string>();
    let current: string | undefined = parentId;
    while (current !== undefined) {
      if (current === id || seen.has(current)) return true;
      seen.add(current);
      current = this.payloadById.get(current)?.parent_id;
    }
    return false;
  }

  private sortNodes(nodes: TodoTreeNode[]): void {
    nodes.sort((a, b) => this.compareByCreation(a, b));
    for (const node of nodes) this.sortNodes(node.children);
  }

  private compareByCreation(a: TodoTreeNode, b: TodoTreeNode): number {
    const status = TODO_STATUS_RANK[a.status] - TODO_STATUS_RANK[b.status];
    if (status !== 0) return status;
    const assignee = (a.assigned_to ?? "\uffff").localeCompare(
      b.assigned_to ?? "\uffff",
    );
    if (assignee !== 0) return assignee;
    const aCreatedAt = this.createdAtById.get(a.id) ?? "";
    const bCreatedAt = this.createdAtById.get(b.id) ?? "";
    return aCreatedAt.localeCompare(bCreatedAt) || a.id.localeCompare(b.id);
  }
}
