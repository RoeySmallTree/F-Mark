import { useCallback } from "react";
import { createClient, type RootScope } from "../../../api/client.js";

interface UseFetchDescendantsArgs {
  currentSessionId: string | null;
  token: string | null;
  scope: RootScope | null;
}

export function useFetchDescendants({
  currentSessionId,
  token,
  scope,
}: UseFetchDescendantsArgs): (todoId: string) => Promise<string[]> {
  return useCallback(
    async (todoId: string): Promise<string[]> => {
      const sessionId = currentSessionId;
      if (sessionId === null || scope === null) return [];
      const client = createClient({ baseUrl: "", token });
      return client.todoDescendants(sessionId, todoId, scope);
    },
    [currentSessionId, token, scope],
  );
}
