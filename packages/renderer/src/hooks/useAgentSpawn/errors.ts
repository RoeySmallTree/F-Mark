import {
  isProcessApiDisabledError,
  PROCESS_API_DISABLED_MESSAGE,
} from "../../api/managedAgents.js";

export interface AgentSpawnFailure {
  processApiDisabled: boolean;
  message: string;
}

export function describeAgentSpawnFailure(error: unknown): AgentSpawnFailure {
  if (isProcessApiDisabledError(error)) {
    return {
      processApiDisabled: true,
      message: PROCESS_API_DISABLED_MESSAGE,
    };
  }
  return {
    processApiDisabled: false,
    message: error instanceof Error ? error.message : String(error),
  };
}
