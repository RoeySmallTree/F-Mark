export interface EventBusMessage {
  type: "event_added" | "event_superseded";
  session_id: string;
  filename: string;
  kind?: string;
  participant_id?: string;
  supersedes?: string;
}

export interface PathSwitchedBusMessage {
  type: "path-switched";
  activePath: string | null;
  pathId: string | null;
  revision: number;
}

export type BusMessage = EventBusMessage | PathSwitchedBusMessage;
