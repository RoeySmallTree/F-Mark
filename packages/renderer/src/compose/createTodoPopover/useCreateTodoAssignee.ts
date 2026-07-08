import { useEffect, useMemo, useState } from "react";
import type { Participant } from "@f-mark/shared";
import {
  getSessionAgentIds,
  pickRandomAgentId,
} from "../../panels/todoPanelUtils.js";
import { participantOptionsForAgents } from "./model.js";
import type { CreateTodoAssigneeState } from "./types.js";

export function useCreateTodoAssignee(
  participants: Record<string, Participant>,
  sessionId: string | null,
): CreateTodoAssigneeState {
  const [assignedTo, setAssignedTo] = useState<string>(() => {
    const agentIds = getSessionAgentIds(participants, sessionId);
    return pickRandomAgentId(agentIds) ?? "";
  });
  const sessionAgentIds = useMemo(
    () => getSessionAgentIds(participants, sessionId),
    [participants, sessionId],
  );
  const participantOptions = useMemo(
    () => participantOptionsForAgents(participants, sessionAgentIds),
    [participants, sessionAgentIds],
  );

  useEffect(() => {
    setAssignedTo((current) => {
      if (current.length > 0 && sessionAgentIds.includes(current)) {
        return current;
      }
      return pickRandomAgentId(sessionAgentIds) ?? "";
    });
  }, [sessionAgentIds]);

  return {
    assignedTo,
    setAssignedTo,
    participantOptions,
    sessionAgentIds,
    assignedToCurrentSessionAgent:
      assignedTo.length > 0 && sessionAgentIds.includes(assignedTo),
  };
}
