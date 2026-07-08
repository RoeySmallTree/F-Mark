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

export interface PathsUpdatedBusMessage {
  type: "paths-updated";
  paths: Array<{ path: string; path_id: string }>;
}

export interface SessionForkedBusMessage {
  type: "session.forked";
  source_session_id: string;
  session: unknown;
  pathId?: string | null;
  revision?: number;
}

export interface SessionRenamedBusMessage {
  type: "session.renamed";
  /* The session id is immutable; a rename only changes the display slug.
     Clients refresh the session list so labels update — no state is keyed
     by the name. */
  session: unknown;
  pathId?: string | null;
  revision?: number;
}

export interface FilesChangedBusMessage {
  type: "files.changed";
  root: string;
  pathId?: string | null;
  revision?: number;
}

export type BusMessage =
  | EventBusMessage
  | PathSwitchedBusMessage
  | PathsUpdatedBusMessage
  | SessionForkedBusMessage
  | SessionRenamedBusMessage
  | FilesChangedBusMessage;
