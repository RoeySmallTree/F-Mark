export type ParticipantKind = "user" | "agent" | "sys" | "grp";

export const PARTICIPANT_KINDS = {
  user: "user",
  agent: "agent",
  sys: "sys",
  group: "grp",
} as const satisfies Record<string, ParticipantKind>;

export interface Participant {
  kind: "user" | "agent" | "sys";
  name: string;
  color: string;
  /* User avatar glyph preset id ("01"–"55"). The machine user profile is the
     source of truth; participant lists overlay it at read time. Omitted agents
     resolve a deterministic default from participant id at render time. */
  avatar_preset?: string;
  /* Runtime id (e.g. "claude", "codex", "opencode") for managed agents.
     Set on register/spawn; omitted for user participants and for legacy
     agents recorded before this field existed. Renderers map this to a
     human-readable display name via the runtime registry. */
  runtime_id?: string;
  /* Session this agent is currently bound to (its `.f-mark/agents/{id}/
     active-session` file). Written by spawn (when session_id provided)
     and POST /agents/:id/link. autoStream refuses to post events without
     it. Enriched onto the wire response by GET /participants — NOT
     persisted in config.json. Null when the agent has never been linked.
     Always null/undefined for users. */
  active_session?: string | null;
  /* Pinned model for this managed agent. Applied via the runtime's adapter
     buildSpawnArgs() on spawn/respawn. Persisted in participants.json. */
  model_override?: string;
  /* Pinned effort/variant for this managed agent. Provider-specific
     string (codex: low|medium|high|xhigh; opencode: variant key; claude:
     low|medium|high|xhigh|max). */
  effort_override?: string;
}

export interface RegisteredAgent {
  id: string;
  name: string;
  color: string;
}

export interface RegisterAgentRequest {
  kind: "agent";
  name: string;
  suggested_id?: string;
}

export interface UpdateParticipantPatch {
  name?: string;
  color?: string;
  avatar_preset?: string | null;
}

export interface UserProfile {
  name: string;
  color: string;
  avatar_preset?: string;
}

export interface UpdateUserProfilePatch {
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

export interface LinkAgentRequest {
  session_id: string;
}

export interface LinkAgentResponse {
  participant_id: string;
  session_id: string;
}
