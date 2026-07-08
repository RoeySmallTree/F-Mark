import { useMemo, type Dispatch, type SetStateAction } from "react";
import type { Participant } from "@f-mark/shared";
import { getSessionAgentIds } from "../../../panels/todoPanelUtils.js";
import { useStore } from "../../../state/store.js";
import type { TodoCardPostContext } from "../todoCardMutation.js";

export interface TodoCardRuntimeContext {
  sessionId: string | null;
  userId: string | null;
  token: string | null;
  sessions: TodoCardPostContext["sessions"];
  activePath: string | null;
  activePathId: string | null;
  agentIds: string[];
}

export function useTodoCardRuntimeContext(
  participants: Record<string, Participant>,
): TodoCardRuntimeContext {
  const sessionId = useStore((s) => s.currentSessionId);
  const userId = useStore((s) => s.currentUserId);
  const token = useStore((s) => s.token);
  const sessions = useStore((s) => s.sessions);
  const activePath = useStore((s) => s.activePath);
  const activePathId = useStore((s) => s.activePathId);
  const agentIds = getSessionAgentIds(participants, sessionId);

  return {
    sessionId,
    userId,
    token,
    sessions,
    activePath,
    activePathId,
    agentIds,
  };
}

export function useTodoCardPostContext(
  {
    sessionId,
    token,
    sessions,
    activePath,
    activePathId,
    agentIds,
  }: TodoCardRuntimeContext,
  payloadId: string,
  setLatestOverride: Dispatch<SetStateAction<string | null>>,
): TodoCardPostContext {
  return useMemo(
    () => ({
      sessionId,
      token,
      sessions,
      activePathId,
      activePath,
      agentIds,
      trackedTodoId: payloadId,
      setLatestOverride,
    }),
    [
      sessionId,
      token,
      sessions,
      activePathId,
      activePath,
      agentIds,
      payloadId,
      setLatestOverride,
    ],
  );
}
