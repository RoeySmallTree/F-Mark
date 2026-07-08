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
  /* Required root scope (expansion-decisions.md X2). Exactly one of
     path_id/root identifies the project root whose agent state + tmux
     liveness the wake resolves against. A missing scope is rejected with
     400 ROOT_SCOPE_REQUIRED; an unknown one with 404 UNKNOWN_ROOT. */
  path_id?: string;
  root?: string;
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
  /** Display slug from the session meta; the id above is immutable. */
  session_slug?: string;
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
    | "paused"
    | "runtime-missing"
    | "runtime-unknown"
    | "resume-unsupported"
    | "missing-native-session-id"
    | "not-idle-stopped"
    | "resume-failed"
    | "no-unread-events";
  detail?: string;
}

export interface WakeSessionResponse {
  session_id: string;
  notified: string[];
  delivered: WakeDeliveredAgent[];
  skipped: WakeSkippedAgent[];
  event_count: number;
}

export interface EnsureManagedAgentsRequest {
  target_participant_ids?: string[];
  idle_only?: boolean;
  path_id?: string;
  root?: string;
}

export interface EnsureManagedAgentResult {
  participant_id: string;
  tmux_session: string;
}

export interface EnsureManagedAgentsResponse {
  session_id: string;
  resumed: EnsureManagedAgentResult[];
  already_live: EnsureManagedAgentResult[];
  skipped: WakeSkippedAgent[];
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
  path_id?: string;
  root?: string;
}

export interface MarkSeenResponse {
  session_id: string;
  participant_id: string;
  cursor: string | null;
}
