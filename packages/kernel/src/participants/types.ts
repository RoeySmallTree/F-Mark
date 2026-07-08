import type { Participant } from "../project.js";
import type { AgentStateStore } from "../services/agentState.js";

export interface RegisterAgentInput {
  name: string;
  suggested_id?: string;
  runtime_id?: string;
  knownRuntimeIds?: ReadonlySet<string>;
}

export interface RegisteredAgent {
  id: string;
  name: string;
  color: string;
}

export interface ForkAgentParticipantInput {
  sourceParticipantId: string;
  sourceSessionId: string;
  forkSessionId: string;
}

export interface ForkAgentParticipantResult {
  id: string;
  participant: Participant;
}

export interface UpdateParticipantInput {
  name?: string;
  color?: string;
  avatar_preset?: string | null;
}

export interface UpdatedParticipant {
  id: string;
  kind: "user" | "agent" | "sys";
  name: string;
  color: string;
  avatar_preset?: string;
}

/* Wire shape: the persisted Participant from project.ts plus active_session
   read from `.f-mark/agents/{id}/active-session`. Users always get
   active_session: null. Agents that have never been linked (no spawn,
   no /agents/:id/link) also get null. */
export type ParticipantWithSession = Participant & {
  active_session: string | null;
};

export interface ListParticipantsOptions {
  agentState?: AgentStateStore;
}

export interface ExistingParticipantContext {
  participants: Record<string, Participant>;
  current: Participant;
}
