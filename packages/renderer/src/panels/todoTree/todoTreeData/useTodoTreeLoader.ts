import { useCallback, useEffect, useRef, useState } from "react";
import {
  createClient,
  type RootScope,
  type TodoListResponse,
} from "../../../api/client.js";
import { EMPTY_TODOS, normalizeTodos } from "../../todoPanelUtils.js";
import type { IsCurrentTodoSession, LoadTodos } from "./types.js";

interface TodoTreeLoader {
  todos: TodoListResponse;
  loadedSessionId: string | null;
  loadError: string | null;
  loadTodos: LoadTodos;
  isCurrentSession: IsCurrentTodoSession;
}

interface UseTodoTreeLoaderArgs {
  currentSessionId: string | null;
  token: string | null;
  scope: RootScope | null;
  reloadVersion: number;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function useTodoTreeLoader({
  currentSessionId,
  token,
  scope,
  reloadVersion,
}: UseTodoTreeLoaderArgs): TodoTreeLoader {
  const [todos, setTodos] = useState<TodoListResponse>(EMPTY_TODOS);
  const [loadedSessionId, setLoadedSessionId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadRequestRef = useRef(0);
  const loadedSessionIdRef = useRef<string | null>(null);
  const currentSessionIdRef = useRef<string | null>(currentSessionId);

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  const isCurrentLoad = useCallback(
    (requestId: number, sessionId: string | null): boolean =>
      requestId === loadRequestRef.current &&
      currentSessionIdRef.current === sessionId,
    [],
  );

  const clearTodosForMissingSession = useCallback(
    (requestId: number): void => {
      if (!isCurrentLoad(requestId, null)) return;
      setTodos(EMPTY_TODOS);
      loadedSessionIdRef.current = null;
      setLoadedSessionId(null);
    },
    [isCurrentLoad],
  );

  const applyLoadedTodos = useCallback(
    (
      requestId: number,
      sessionId: string,
      next: TodoListResponse,
    ): void => {
      if (!isCurrentLoad(requestId, sessionId)) return;
      setTodos(next);
      loadedSessionIdRef.current = sessionId;
      setLoadedSessionId(sessionId);
      setLoadError(null);
    },
    [isCurrentLoad],
  );

  const applyLoadError = useCallback(
    (requestId: number, sessionId: string, err: unknown): void => {
      if (!isCurrentLoad(requestId, sessionId)) return;
      if (loadedSessionIdRef.current !== sessionId) {
        setTodos(EMPTY_TODOS);
      }
      loadedSessionIdRef.current = sessionId;
      setLoadedSessionId(sessionId);
      setLoadError(errorMessage(err));
    },
    [isCurrentLoad],
  );

  const loadTodos = useCallback(async (): Promise<void> => {
    const requestId = ++loadRequestRef.current;
    const sessionId = currentSessionId;

    if (sessionId === null) {
      clearTodosForMissingSession(requestId);
      return;
    }
    if (currentSessionIdRef.current !== sessionId) return;
    if (scope === null) {
      applyLoadError(requestId, sessionId, new Error("No active session."));
      return;
    }

    const client = createClient({ baseUrl: "", token });
    try {
      const next = normalizeTodos(await client.listTodos(sessionId, scope));
      applyLoadedTodos(requestId, sessionId, next);
    } catch (err) {
      applyLoadError(requestId, sessionId, err);
    }
  }, [
    currentSessionId,
    token,
    scope,
    clearTodosForMissingSession,
    applyLoadedTodos,
    applyLoadError,
  ]);

  useEffect(() => {
    void loadTodos();
  }, [loadTodos, reloadVersion]);

  const isCurrentSession = useCallback(
    (sessionId: string): boolean => currentSessionIdRef.current === sessionId,
    [],
  );

  return {
    todos,
    loadedSessionId,
    loadError,
    loadTodos,
    isCurrentSession,
  };
}
