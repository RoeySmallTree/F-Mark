import type { AnyEventRecord } from "./events.js";

export type WakeReason =
  | "user-message"
  | "comment"
  | "mention"
  | "todo"
  | "manual";

export interface WakeSessionRequest {
  target_participant_ids?: string[];
  reason?: WakeReason;
  source_event?: string;
}

export interface CompassPacketEvent {
  filename: string;
  timestamp: string;
  participant_id: string;
  kind: string;
  summary: string;
  /* Comment-anchor metadata for prose events. When `kind === "prose"` and
     `mode === "comment"`, an agent waking on this event needs to know
     which parent prose the comment is anchored to and which lines it
     refers to — otherwise the comment text is context-free. Populated
     by `packetEvent` from the prose payload so agents can resolve the
     anchor without an extra `fmark_get_inbox` round-trip just to learn
     where the comment lives. */
  append_to?: string;
  mode?: "content" | "comment";
  lines?: [number, number];
}

export interface CompassPacket {
  type: "fmark.wake";
  session_id: string;
  participant_id: string;
  reason?: WakeReason;
  source_event?: string;
  cursor_before: string | null;
  cursor_after: string | null;
  event_count: number;
  events: CompassPacketEvent[];
}

export interface WakeDeliveredAgent {
  participant_id: string;
  tmux_session: string;
  cursor_before: string | null;
  cursor_after: string | null;
  event_count: number;
}

export interface WakeSkippedAgent {
  participant_id: string;
  reason:
    | "invalid-target"
    | "not-managed"
    | "not-active"
    | "pane-dead"
    | "paused";
  detail?: string;
}

export interface WakeSessionResponse {
  session_id: string;
  notified: string[];
  delivered: WakeDeliveredAgent[];
  skipped: WakeSkippedAgent[];
  event_count: number;
}

export interface GetInboxResponse {
  session_id: string;
  participant_id: string;
  cursor_before: string | null;
  cursor_after: string | null;
  events: AnyEventRecord[];
}

export interface MarkSeenRequest {
  participant_id?: string;
  timestamp?: string;
}

export interface MarkSeenResponse {
  session_id: string;
  participant_id: string;
  cursor: string | null;
}
