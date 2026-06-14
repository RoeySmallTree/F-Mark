import type { AnyEventRecord, EventKind } from "./events.js";
import type { Participant } from "./participants.js";

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

export interface ForkSessionRequest {
  path?: string;
  name?: string;
  relaunch_agents?: boolean;
  agent_ids?: string[];
}

export interface ForkedAgentResult {
  participant_id: string;
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

export interface ListSessionEventsResponse {
  groups: SessionEventGroup[];
}
