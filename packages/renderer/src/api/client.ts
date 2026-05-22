import type {
  AnyEventRecord,
  EventKind,
  Participant,
  RegisteredAgent,
  SearchHit,
  TodoPayload,
} from "@f-mark/shared";

export interface ClientConfig {
  baseUrl: string;
  token: string | null;
}

export interface SessionMeta {
  id: string;
  slug: string;
  created_at: string;
}

export interface EventListParams {
  since?: string;
  kinds?: EventKind[];
  participant?: string;
}

export interface PostProseBody {
  participant_id: string;
  content: string;
  name?: string;
  target?: { file: string; lines?: [number, number] };
  in_reply_to?: string;
  supersedes?: string;
}

export type TodoBuckets = Record<"open" | "wip" | "done", TodoPayload[]>;

export interface PostTodoBody {
  participant_id: string;
  id: string;
  title: string;
  body?: string;
  status: "open" | "wip" | "done";
  assigned_to?: string;
  supersedes?: string;
}

export interface PostHtmlBody {
  participant_id: string;
  html: string;
  css?: string;
  js?: string;
  title?: string;
  dependencies?: string[];
  supersedes?: string;
}

export interface PostFileBody {
  participant_id: string;
  id: string;
  path: string;
  mime_type: string;
  description?: string;
}

export interface UpdateParticipantPatch {
  name?: string;
  color?: string;
}

export interface UpdatedParticipant {
  id: string;
  kind: "user" | "agent";
  name: string;
  color: string;
}

export interface HealthInfo {
  status: string;
  version: string;
}

export interface Client {
  listSessions(): Promise<SessionMeta[]>;
  createSession(input: { slug?: string }): Promise<SessionMeta>;
  listParticipants(): Promise<Record<string, Participant>>;
  registerAgent(input: {
    name: string;
    suggested_id?: string;
  }): Promise<RegisteredAgent>;
  updateParticipant(
    id: string,
    patch: UpdateParticipantPatch,
  ): Promise<UpdatedParticipant>;
  health(): Promise<HealthInfo>;
  listEvents(sessionId: string, params: EventListParams): Promise<AnyEventRecord[]>;
  postProse(sessionId: string, body: PostProseBody): Promise<{ filename: string }>;
  postTurnEnd(
    sessionId: string,
    participantId: string,
  ): Promise<{ filename: string }>;
  postChoice(
    sessionId: string,
    body: { participant_id: string; choices_id: string; selected: string[] },
  ): Promise<{ filename: string }>;
  postTodo(sessionId: string, body: PostTodoBody): Promise<{ filename: string }>;
  postHtml(sessionId: string, body: PostHtmlBody): Promise<{ filename: string }>;
  postFile(sessionId: string, body: PostFileBody): Promise<{ filename: string }>;
  listTodos(sessionId: string, assignedTo?: string): Promise<TodoBuckets>;
  search(query: string, sessionId?: string): Promise<SearchHit[]>;
}

function buildHeaders(token: string | null): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token !== null) h.Authorization = `Bearer ${token}`;
  return h;
}

async function jsonOrThrow(res: Response): Promise<unknown> {
  if (res.ok) return res.json();
  let body: unknown = {};
  try {
    body = await res.json();
  } catch {
    /* ignore */
  }
  const msg =
    typeof body === "object" && body !== null && "error" in body
      ? String((body as { error: unknown }).error)
      : `HTTP ${res.status}`;
  throw new Error(msg);
}

export function createClient(cfg: ClientConfig): Client {
  const url = (path: string): string => `${cfg.baseUrl}${path}`;

  async function get(path: string): Promise<unknown> {
    const res = await fetch(url(path), { headers: buildHeaders(cfg.token) });
    return jsonOrThrow(res);
  }
  async function post(path: string, body: unknown): Promise<unknown> {
    const res = await fetch(url(path), {
      method: "POST",
      headers: buildHeaders(cfg.token),
      body: JSON.stringify(body),
    });
    return jsonOrThrow(res);
  }
  async function patch(path: string, body: unknown): Promise<unknown> {
    const res = await fetch(url(path), {
      method: "PATCH",
      headers: buildHeaders(cfg.token),
      body: JSON.stringify(body),
    });
    return jsonOrThrow(res);
  }

  return {
    async listSessions() {
      const body = (await get("/sessions")) as { sessions: SessionMeta[] };
      return body.sessions;
    },
    async createSession(input) {
      return (await post("/sessions", input)) as SessionMeta;
    },
    async listParticipants() {
      const body = (await get("/participants")) as {
        participants: Record<string, Participant>;
      };
      return body.participants;
    },
    async registerAgent(input) {
      return (await post("/participants/register", {
        kind: "agent",
        ...input,
      })) as RegisteredAgent;
    },
    async updateParticipant(id, body) {
      return (await patch(
        `/participants/${encodeURIComponent(id)}`,
        body,
      )) as UpdatedParticipant;
    },
    async health() {
      return (await get("/health")) as HealthInfo;
    },
    async listEvents(sessionId, params) {
      const qs = new URLSearchParams();
      if (params.since !== undefined) qs.set("since", params.since);
      if (params.kinds !== undefined) qs.set("kinds", params.kinds.join(","));
      if (params.participant !== undefined)
        qs.set("participant", params.participant);
      const suffix = qs.toString();
      const path = `/sessions/${sessionId}/events${suffix ? `?${suffix}` : ""}`;
      const body = (await get(path)) as { events: AnyEventRecord[] };
      return body.events;
    },
    async postProse(sessionId, body) {
      return (await post(
        `/sessions/${sessionId}/events/prose`,
        body,
      )) as { filename: string };
    },
    async postTurnEnd(sessionId, participantId) {
      return (await post(`/sessions/${sessionId}/events/turn-end`, {
        participant_id: participantId,
      })) as { filename: string };
    },
    async postChoice(sessionId, body) {
      return (await post(
        `/sessions/${sessionId}/events/choice`,
        body,
      )) as { filename: string };
    },
    async postTodo(sessionId, body) {
      return (await post(
        `/sessions/${sessionId}/events/todo`,
        body,
      )) as { filename: string };
    },
    async postHtml(sessionId, body) {
      return (await post(
        `/sessions/${sessionId}/events/html`,
        body,
      )) as { filename: string };
    },
    async postFile(sessionId, body) {
      return (await post(
        `/sessions/${sessionId}/events/file`,
        body,
      )) as { filename: string };
    },
    async listTodos(sessionId, assignedTo) {
      const qs = new URLSearchParams();
      if (assignedTo !== undefined && assignedTo.length > 0) {
        qs.set("assigned_to", assignedTo);
      }
      const suffix = qs.toString();
      const path = `/sessions/${sessionId}/todos${suffix ? `?${suffix}` : ""}`;
      return (await get(path)) as TodoBuckets;
    },
    async search(query, sessionId) {
      const qs = new URLSearchParams({ q: query });
      if (sessionId !== undefined && sessionId.length > 0) {
        qs.set("session", sessionId);
      }
      const body = (await get(`/search?${qs.toString()}`)) as {
        hits: SearchHit[];
      };
      return body.hits;
    },
  };
}
