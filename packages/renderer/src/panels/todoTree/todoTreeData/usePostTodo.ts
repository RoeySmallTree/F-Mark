import { useCallback } from "react";
import {
  createClient,
  type PostTodoBody,
  type RootScope,
} from "../../../api/client.js";
import { createManagedAgentsClient } from "../../../api/managedAgents.js";
import { scopeToBody } from "../../../api/rootScope.js";
import type {
  IsCurrentTodoSession,
  LoadTodos,
  RememberLatestTodoFilename,
} from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  todo: "todo",
} as const;

interface UsePostTodoArgs {
  currentSessionId: string | null;
  token: string | null;
  scope: RootScope | null;
  agentIds: string[];
  rememberLatest: RememberLatestTodoFilename;
  loadTodos: LoadTodos;
  isCurrentSession: IsCurrentTodoSession;
}

function shouldWakeAssignedAgent(
  assignedTo: string | undefined,
  agentIds: string[],
): assignedTo is string {
  return assignedTo !== undefined && agentIds.includes(assignedTo);
}

async function wakeAssignedAgentTodo(params: {
  sessionId: string;
  token: string | null;
  sourceFilename: string;
  assignedTo: string;
  scope: RootScope;
}): Promise<void> {
  const managedClient = createManagedAgentsClient({
    baseUrl: "",
    token: params.token,
  });
  await managedClient.wakeSession(params.sessionId, {
    reason: NO_LOOSE_STRING_VALUES.todo,
    source_event: params.sourceFilename,
    target_participant_ids: [params.assignedTo],
    ...scopeToBody(params.scope),
  });
}

export function usePostTodo({
  currentSessionId,
  token,
  scope,
  agentIds,
  rememberLatest,
  loadTodos,
  isCurrentSession,
}: UsePostTodoArgs): (body: PostTodoBody) => Promise<void> {
  return useCallback(
    async (body: PostTodoBody): Promise<void> => {
      const sessionId = currentSessionId;
      if (sessionId === null) return;

      if (scope === null) return;

      const client = createClient({ baseUrl: "", token });
      const result = await client.postTodo(sessionId, body, scope);
      if (shouldWakeAssignedAgent(body.assigned_to, agentIds)) {
        await wakeAssignedAgentTodo({
          sessionId,
          token,
          sourceFilename: result.filename,
          assignedTo: body.assigned_to,
          scope,
        });
      }
      if (!isCurrentSession(sessionId)) return;

      rememberLatest(body.id, result.filename);
      await loadTodos();
    },
    [
      currentSessionId,
      token,
      scope,
      agentIds,
      rememberLatest,
      loadTodos,
      isCurrentSession,
    ],
  );
}
