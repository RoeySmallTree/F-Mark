export type ParticipantKind = "user" | "agent" | "sys" | "grp";

export interface Participant {
  kind: "user" | "agent";
  name: string;
  color: string;
}

export interface RegisteredAgent {
  id: string;
  name: string;
  color: string;
}
