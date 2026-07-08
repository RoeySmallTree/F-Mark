import type { TodoTreeNode } from "@f-mark/shared";
import type { FlattenedTodo, TodoDropdownOption } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  root: "ROOT",
} as const;

export function flattenTree(roots: TodoTreeNode[]): FlattenedTodo[] {
  return new TodoTreeFlattener(roots).flatten();
}

export function flattenTreeForDropdown(
  roots: TodoTreeNode[],
): TodoDropdownOption[] {
  const flat: TodoDropdownOption[] = [];
  visitDropdownNodes(roots, 0, flat);
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
  return parent?.parentId ?? NO_LOOSE_STRING_VALUES.root;
}

class TodoTreeFlattener {
  private readonly flat: FlattenedTodo[] = [];

  constructor(private readonly roots: TodoTreeNode[]) {}

  flatten(): FlattenedTodo[] {
    this.visit(this.roots, 0, undefined);
    this.linkNeighbors();
    return this.flat;
  }

  private visit(
    nodes: TodoTreeNode[],
    depth: number,
    parentId: string | undefined,
  ): void {
    for (const node of nodes) {
      this.flat.push(newFlattenedTodo(node.id, depth, parentId));
      this.visit(node.children, depth + 1, node.id);
    }
  }

  private linkNeighbors(): void {
    const lastByDepth = new Map<number, FlattenedTodo>();
    for (let idx = 0; idx < this.flat.length; idx += 1) {
      const item = this.flat[idx]!;
      item.prevId = idx > 0 ? this.flat[idx - 1]!.id : null;
      item.nextId = idx < this.flat.length - 1 ? this.flat[idx + 1]!.id : null;
      this.linkSameDepth(item, lastByDepth);
    }
  }

  private linkSameDepth(
    item: FlattenedTodo,
    lastByDepth: Map<number, FlattenedTodo>,
  ): void {
    const previousAtDepth = lastByDepth.get(item.depth);
    item.prevSameDepthId = previousAtDepth?.id ?? null;
    if (previousAtDepth !== undefined) {
      previousAtDepth.nextSameDepthId = item.id;
    }
    lastByDepth.set(item.depth, item);
  }
}

function newFlattenedTodo(
  id: string,
  depth: number,
  parentId: string | undefined,
): FlattenedTodo {
  return {
    id,
    depth,
    parentId,
    prevId: null,
    nextId: null,
    prevSameDepthId: null,
    nextSameDepthId: null,
  };
}

function visitDropdownNodes(
  nodes: TodoTreeNode[],
  depth: number,
  flat: TodoDropdownOption[],
): void {
  for (const node of nodes) {
    flat.push({ id: node.id, title: node.title, depth });
    visitDropdownNodes(node.children, depth + 1, flat);
  }
}
