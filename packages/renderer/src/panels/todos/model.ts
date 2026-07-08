import type { TodoPayload } from "@f-mark/shared";
import type { SessionEventGroup, SessionMeta } from "../../api/client.js";
import {
  groupRecordsByPath,
  type useAllSessionEvents,
} from "../allSessions.js";

const NO_LOOSE_STRING_VALUES = {
  open: "open",
  wip: "wip",
  done: "done",
  todo: "todo",
} as const;

type TodoStatus = "open" | "wip" | "done";

export interface LatestTodo {
  filename: string;
  participant_id: string;
  payload: TodoPayload;
}

export interface TodoRecord {
  group: SessionEventGroup;
  todos: LatestTodo[];
}

export interface CurrentTodoScope {
  currentPath: string;
  currentSession: SessionMeta | null;
  shouldRenderEditor: boolean;
}

const TODO_STATUS_RANK: Record<TodoStatus, number> = {
  wip: 0,
  open: 1,
  done: 2,
};

function isVisibleStatus(status: TodoPayload["status"]): status is TodoStatus {
  return status === NO_LOOSE_STRING_VALUES.open || status === NO_LOOSE_STRING_VALUES.wip || status === NO_LOOSE_STRING_VALUES.done;
}

function latestTodos(
  events: ReturnType<typeof useAllSessionEvents>["groups"][number]["events"],
): LatestTodo[] {
  const latestById = new Map<string, LatestTodo & { ts: string }>();
  const superseded = new Set<string>();

  for (const event of events) {
    if (event.kind !== NO_LOOSE_STRING_VALUES.todo) continue;
    const payload = event.payload as TodoPayload;
    if (typeof payload.supersedes === "string") superseded.add(payload.supersedes);
    if (typeof payload.id !== "string" || payload.id.length === 0) continue;
    const existing = latestById.get(payload.id);
    if (existing === undefined || event.timestamp > existing.ts) {
      latestById.set(payload.id, {
        payload,
        filename: event.filename,
        participant_id: event.participant_id,
        ts: event.timestamp,
      });
    }
  }

  return [...latestById.values()]
    .filter((item) => !superseded.has(item.filename))
    .filter((item) => isVisibleStatus(item.payload.status))
    .sort(compareTodoItems);
}

export function currentTodoScope(
  currentSessionId: string | null,
  sessions: SessionMeta[],
  activePath: string | null,
): CurrentTodoScope {
  const currentSession =
    currentSessionId === null
      ? null
      : (sessions.find((session) => session.id === currentSessionId) ?? null);
  const currentPath =
    activePath ??
    currentSession?.path ??
    (currentSession === null ? "" : "Current repo");
  return {
    currentPath,
    currentSession,
    shouldRenderEditor: currentSession !== null || currentSessionId === null,
  };
}

export function visibleTodoPathGroups(
  groups: SessionEventGroup[],
  currentSessionId: string | null,
  activePathId: string | null,
): ReturnType<typeof groupRecordsByPath<TodoRecord>> {
  const visibleGroups = groups
    .map((group) => ({ group, todos: latestTodos(group.events) }))
    .filter(({ group, todos }) =>
      shouldShowTodoRecord(group, todos, currentSessionId, activePathId),
    );
  return groupRecordsByPath(visibleGroups);
}

function shouldShowTodoRecord(
  group: SessionEventGroup,
  todos: LatestTodo[],
  currentSessionId: string | null,
  activePathId: string | null,
): boolean {
  if (todos.length === 0) return false;
  if (currentSessionId === null) return true;
  if (group.session.id !== currentSessionId) return true;
  return activePathId !== null && group.path_id !== activePathId;
}

function compareTodoItems(
  a: LatestTodo & { ts?: string },
  b: LatestTodo & { ts?: string },
): number {
  return compareTodoStatus(a, b) || (b.ts ?? "").localeCompare(a.ts ?? "");
}

function compareTodoStatus(a: LatestTodo, b: LatestTodo): number {
  return (
    TODO_STATUS_RANK[a.payload.status as TodoStatus] -
    TODO_STATUS_RANK[b.payload.status as TodoStatus]
  );
}
