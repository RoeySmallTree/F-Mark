import type { AnyEventRecord, EventKind } from "./events.js";
import type { Participant } from "./participants.js";

/** Slug given to sessions created without an explicit name. Agents are
 *  prompted (launch packet + wake packets) to rename placeholder sessions
 *  via `fmark_rename_session` once they know what the session is about. */
export const PLACEHOLDER_SESSION_SLUG = "new-session";
const PLACEHOLDER_SLUG_PATTERN = /^new-session(-\d+)?$/;

/** Collision suffixes (`new-session-2`) still count as placeholders. */
export function isPlaceholderSessionSlug(slug: string): boolean {
  return PLACEHOLDER_SLUG_PATTERN.test(slug);
}

/** Placeholder check straight from a session id (date prefix stripped). */
export function isPlaceholderSessionId(id: string): boolean {
  return isPlaceholderSessionSlug(id.replace(/^\d{4}-\d{2}-\d{2}-/, ""));
}

export interface SessionMeta {
  id: string;
  slug: string;
  created_at: string;
  path?: string;
  path_id?: string;
}

export interface SessionWithPath extends SessionMeta {
  path: string;
  path_id: string;
}

export interface CreateSessionRequest {
  slug?: string;
  path?: string;
}

export interface UpdateSessionRequest {
  slug: string;
  path?: string;
}

/* The session id is immutable; a rename only updates the display slug in
   the session meta. The response is simply the session with its new slug. */
export type UpdateSessionResponse = SessionWithPath;

export interface ForkSessionRequest {
  path?: string;
  name?: string;
  relaunch_agents?: boolean;
  agent_ids?: string[];
}

export interface ForkedAgentResult {
  participant_id: string;
  fork_participant_id?: string;
  runtime_id: string | null;
  display_name: string;
  status:
    | "duplicated"
    | "relaunched"
    | "skipped-paused"
    | "skipped-detached"
    | "skipped-unsupported"
    | "failed";
  tmux_session?: string | null;
  native_command?: string | null;
  native_session_id?: string | null;
  native_parent_session_id?: string | null;
  warning?: string;
}

export interface ForkSessionResponse {
  source_session_id: string;
  session: SessionWithPath;
  copied_entries: number;
  agents: ForkedAgentResult[];
  warnings: string[];
}

export interface ListSessionsResponse {
  sessions: SessionMeta[];
}

export interface EventListParams {
  since?: string;
  kinds?: EventKind[];
  participant?: string;
  path?: string;
}

export interface ListEventsResponse {
  events: AnyEventRecord[];
}

export interface SessionEventGroup {
  path: string;
  path_id: string;
  session: SessionMeta;
  events: AnyEventRecord[];
  participants: Record<string, Participant>;
}

export interface ListSessionEventsCursor {
  key: string;
  checked_at: string;
  sessions_updated: number;
}

export interface ListSessionEventsResponse {
  groups: SessionEventGroup[];
  mode?: "full" | "incremental";
  cursor?: ListSessionEventsCursor;
}
