import { randomAgentColor, randomAgentName } from "../../lib/agentNaming.js";
import type { ConnectingAgent } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  agent: "agent",
} as const;

export interface AgentSpawnDraft {
  participantId: string;
  suggestedName: string;
  color: string;
}

function randomHex(bytes: number): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  ) {
    const data = new Uint8Array(bytes);
    crypto.getRandomValues(data);
    return [...data]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }
  return Math.floor(Math.random() * 16 ** (bytes * 2))
    .toString(16)
    .padStart(bytes * 2, "0");
}

function suggestedParticipantId(runtimeId: string): string {
  const safeRuntime = runtimeId
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 8);
  return `ag-${safeRuntime.length > 0 ? safeRuntime : NO_LOOSE_STRING_VALUES.agent}-${randomHex(2)}`;
}

export function createAgentSpawnDraft(runtimeId: string): AgentSpawnDraft {
  return {
    participantId: suggestedParticipantId(runtimeId),
    suggestedName: randomAgentName(),
    color: randomAgentColor(),
  };
}

export function createConnectingAgent(
  draft: AgentSpawnDraft,
  runtimeId: string,
  sessionId: string | null,
): ConnectingAgent {
  return {
    participantId: draft.participantId,
    name: draft.suggestedName,
    color: draft.color,
    runtimeId,
    sessionId,
    startedAtMs: Date.now(),
  };
}
