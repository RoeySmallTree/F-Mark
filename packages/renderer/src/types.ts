export interface EventBusMessage {
  type: "event_added" | "event_superseded";
  session_id: string;
  filename: string;
  kind?: string;
  participant_id?: string;
  supersedes?: string;
  /** Path envelope — set by the kernel's WS wrap. Used by the renderer to
      drop stale events from a path that's no longer active. */
  pathId?: string | null;
  revision?: number;
}

export interface PathSwitchedBusMessage {
  type: "path-switched";
  activePath: string | null;
  pathId: string | null;
  revision: number;
}

export type BusMessage = EventBusMessage | PathSwitchedBusMessage;
