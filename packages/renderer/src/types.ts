export interface BusMessage {
  type: "event_added" | "event_superseded";
  session_id: string;
  filename: string;
  kind?: string;
  participant_id?: string;
  supersedes?: string;
}
