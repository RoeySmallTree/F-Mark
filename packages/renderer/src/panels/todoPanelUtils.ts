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
