import { useEffect, useState } from "react";
import type { TodoTreeNode } from "@f-mark/shared";
import { createClient, type RootScope } from "../../api/client.js";
import { normalizeTodos } from "../../panels/todoPanelUtils.js";
import type { TodoRootsState } from "./types.js";

export function useTodoRoots(input: {
  sessionId: string | null;
  token: string | null;
  scope: RootScope | null;
}): TodoRootsState {
  const { sessionId, token, scope } = input;
  const [roots, setRoots] = useState<TodoTreeNode[]>([]);
  const [loadingTodos, setLoadingTodos] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionId === null) return;
    let cancelled = false;
    const client = createClient({ baseUrl: "", token });
    setLoadingTodos(true);
    setLoadError(null);
    void (async () => {
      try {
        if (scope === null) throw new Error("No active session.");
        const todos = normalizeTodos(await client.listTodos(sessionId, scope));
        if (!cancelled) setRoots(todos.tree);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoadingTodos(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, scope, token]);

  return { roots, loadingTodos, loadError };
}
