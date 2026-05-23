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
}

export interface RegisteredAgent {
  id: string;
  name: string;
  color: string;
}
