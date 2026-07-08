import {
  useEffect,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { TodoListResponse } from "../../api/client.js";
import {
  generateTodoId,
  pickRandomAgentId,
} from "../todoPanelUtils.js";
import type { DraftTodo } from "./types.js";

interface UseAutoFirstDraftArgs {
  currentSessionId: string | null;
  actorId: string | null;
  loadedSessionId: string | null;
  loadError: string | null;
  todos: TodoListResponse;
  draft: DraftTodo | null;
  agentIds: string[];
  setDraft: Dispatch<SetStateAction<DraftTodo | null>>;
}

export function useAutoFirstDraft({
  currentSessionId,
  actorId,
  loadedSessionId,
  loadError,
  todos,
  draft,
  agentIds,
  setDraft,
}: UseAutoFirstDraftArgs): void {
  /* Empty session: auto-open a draft so the user lands in a typing-ready
     state. The draft is UI-only until the user types and commits a title. */
  useEffect(() => {
    if (currentSessionId === null || actorId === null) return;
    if (loadedSessionId !== currentSessionId) return;
    if (loadError !== null) return;
    const bucketCount =
      todos.open.length + todos.wip.length + todos.done.length;
    if (todos.tree.length > 0 || bucketCount > 0 || draft !== null) return;
    setDraft({
      id: generateTodoId(),
      assignedTo: pickRandomAgentId(agentIds),
    });
  }, [
    actorId,
    agentIds,
    currentSessionId,
    draft,
    loadedSessionId,
    loadError,
    setDraft,
    todos.tree.length,
    todos.open.length,
    todos.wip.length,
    todos.done.length,
  ]);
}
