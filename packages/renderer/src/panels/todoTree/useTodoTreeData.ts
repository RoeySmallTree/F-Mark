import { useMemo, useState } from "react";
import { useCurrentSessionRootScope } from "../../hooks/useCurrentSessionRootScope.js";
import { getSessionAgentIds } from "../todoPanelUtils.js";
import type { TodoTreeData } from "./todoTreeData/types.js";
import { useFetchDescendants } from "./todoTreeData/useFetchDescendants.js";
import { useLatestTodoMap } from "./todoTreeData/useLatestTodoMap.js";
import { usePostTodo } from "./todoTreeData/usePostTodo.js";
import { useTodoTreeLoader } from "./todoTreeData/useTodoTreeLoader.js";
import { useTodoTreeStoreSnapshot } from "./todoTreeData/useTodoTreeStoreSnapshot.js";

export function useTodoTreeData(): TodoTreeData {
  const {
    currentSessionId,
    token,
    actorId,
    participants,
    events,
  } = useTodoTreeStoreSnapshot();
  const [actionError, setActionError] = useState<string | null>(null);
  const scope = useCurrentSessionRootScope(currentSessionId);

  const agentIds = useMemo(
    () => getSessionAgentIds(participants, currentSessionId),
    [participants, currentSessionId],
  );

  const { latestById, rememberLatest } = useLatestTodoMap({
    events,
    sessionId: currentSessionId,
  });

  const {
    todos,
    loadedSessionId,
    loadError,
    loadTodos,
    isCurrentSession,
    isTodosReloading,
  } = useTodoTreeLoader({
    currentSessionId,
    token,
    scope,
    reloadVersion: events.length,
  });

  const postTodo = usePostTodo({
    currentSessionId,
    token,
    scope,
    agentIds,
    rememberLatest,
    loadTodos,
    isCurrentSession,
  });

  const fetchDescendants = useFetchDescendants({
    currentSessionId,
    token,
    scope,
  });

  return {
    currentSessionId,
    actorId,
    participants,
    agentIds,
    todos,
    loadedSessionId,
    loadError,
    actionError,
    setActionError,
    latestById,
    postTodo,
    fetchDescendants,
    isTodosReloading,
  };
}
