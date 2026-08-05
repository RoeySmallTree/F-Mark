import type { AnyEventRecord, Participant } from "@f-mark/shared";
import type {
  PostTodoBody,
  TodoListResponse,
} from "../../../api/client.js";
import type { Dispatch, SetStateAction } from "react";

export interface TodoTreeData {
  currentSessionId: string | null;
  actorId: string | null;
  participants: Record<string, Participant>;
  agentIds: string[];
  todos: TodoListResponse;
  loadedSessionId: string | null;
  loadError: string | null;
  actionError: string | null;
  setActionError: Dispatch<SetStateAction<string | null>>;
  latestById: Map<string, string>;
  postTodo: (body: PostTodoBody) => Promise<void>;
  fetchDescendants: (todoId: string) => Promise<string[]>;
  isTodosReloading: IsTodosReloading;
}

export interface TodoTreeStoreSnapshot {
  currentSessionId: string | null;
  token: string | null;
  actorId: string | null;
  participants: Record<string, Participant>;
  events: AnyEventRecord[];
}

export type RememberLatestTodoFilename = (
  id: string,
  filename: string,
) => void;

export type LoadTodos = () => Promise<void>;

export type IsCurrentTodoSession = (sessionId: string) => boolean;

/* True while a loadTodos() reload is in flight — the single source of truth
   consumers gate on to avoid acting on a stale (pre-reload) snapshot. See
   useTodoTreeLoader's reloadInFlightRef. */
export type IsTodosReloading = () => boolean;
