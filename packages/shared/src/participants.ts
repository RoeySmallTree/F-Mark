export type ParticipantKind = "user" | "agent" | "sys" | "grp";

export interface Participant {
  kind: "user" | "agent";
  name: string;
  color: string;
  /* Runtime id (e.g. "claude", "codex", "gemini") for managed agents.
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
}

export interface RegisteredAgent {
  id: string;
  name: string;
  color: string;
}
