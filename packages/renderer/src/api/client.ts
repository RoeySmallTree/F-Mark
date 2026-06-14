import type {
  AnyEventRecord,
  CreateSessionRequest,
  EventKind,
  EventListParams,
  ForkSessionRequest,
  ForkSessionResponse,
  ListEventsResponse,
  ListSessionEventsResponse,
  ListSessionsResponse,
  Participant,
  PostFileBody,
  PostFlowBody,
  PostHtmlBody,
  PostProseBody,
  PostTodoBody,
  Preset,
  RegisteredAgent,
  SearchHit,
  SessionEventGroup,
  SessionMeta,
  SkillRef,
  TodoListResponse,
  UpdateParticipantPatch,
  UpdatedParticipant,
  UpdateSessionRequest,
  UploadAttachmentResponse,
} from "@f-mark/shared";

export interface ClientConfig {
  baseUrl: string;
  token: string | null;
}

export type {
  EventListParams,
  ForkSessionRequest,
  ForkSessionResponse,
  PostFileBody,
  PostFlowBody,
  PostHtmlBody,
  PostProseBody,
  PostTodoBody,
  SessionEventGroup,
  SessionMeta,
  TodoListResponse,
  UpdateParticipantPatch,
  UpdatedParticipant,
  UpdateSessionRequest,
  UploadAttachmentResponse,
} from "@f-mark/shared";

export interface UploadAttachmentInput {
  file: File;
  participant_id?: string;
  display_name?: string;
  description?: string;
}

export interface HealthInfo {
  status: string;
  version: string;
  processApiEnabled?: boolean;
}

export interface FsListEntry {
  name: string;
  isDir: boolean;
}
export interface FsListResponse {
  path: string;
  parent: string | null;
  entries: FsListEntry[];
  truncated: boolean;
}

export interface PathFavorite {
  name: string;
  path: string;
}

export interface FilesTreeEntry {
  index: number;
  parent: number | null;
  name: string;
  relPath: string;
  absPath: string;
  isDir: boolean;
  isSymlink: boolean;
  ext: string | null;
  size: number | null;
  mtimeMs: number;
  ignored: boolean;
  depth: number;
}

export interface FilesTreeResponse {
  root: string;
  entries: FilesTreeEntry[];
  truncated: boolean;
  truncatedAt: number;
}

export type FilesFavoritesScope = "project" | "session";

export interface FilesFavoritesResponse {
  paths: string[];
}

export interface FileTextResponse {
  content: string;
  truncated: boolean;
  size: number;
  mtimeMs: number;
}

export interface PathsResponse {
  activePath: string | null;
  /** sha256(realpath)[0..11] of the active path; null when activePath is null. */
  activePathId: string | null;
  activeRevision: number;
  knownPaths: string[];
  favorites: PathFavorite[];
}

export interface Client {
  listSessions(): Promise<SessionMeta[]>;
  listAllSessions(): Promise<SessionMeta[]>;
  createSession(input: CreateSessionRequest): Promise<SessionMeta>;
  updateSession(
    sessionId: string,
    input: UpdateSessionRequest,
  ): Promise<SessionMeta>;
  deleteSession(sessionId: string, path?: string): Promise<void>;
  forkSession(
    sourceSessionId: string,
    input: ForkSessionRequest,
  ): Promise<ForkSessionResponse>;
  listAllSessionEvents(kinds?: EventKind[]): Promise<SessionEventGroup[]>;
  /** Browse a folder on the kernel host. Used by the session-folder picker. */
  fsList(path: string): Promise<FsListResponse>;
  /** Default starting points for the folder picker. */
  fsHome(): Promise<{ home: string; xdgConfigHome: string | null }>;
  /** Read the multi-path state — activePath, knownPaths, favorites. */
  getPaths(): Promise<PathsResponse>;
  /** Switch the active path. Kernel validates + persists + bumps revision. */
  setActivePath(path: string): Promise<PathsResponse>;
  /** Clear the active path (renderer goes to empty state). */
  clearActivePath(): Promise<PathsResponse>;
  /** Remove an entry from knownPaths (e.g., user moved a folder). */
  removeKnownPath(path: string): Promise<{ knownPaths: string[] }>;
  addFavorite(input: { name: string; path: string }): Promise<{ favorites: PathFavorite[] }>;
  removeFavorite(path: string): Promise<{ favorites: PathFavorite[] }>;
  renameFavorite(input: { path: string; newName: string }): Promise<{ favorites: PathFavorite[] }>;
  /** Walk the project filesystem and return a flat entry tree. */
  fetchFilesTree(root: string): Promise<FilesTreeResponse>;
  fetchFilesFavorites(
    scope: FilesFavoritesScope,
    sessionId?: string,
  ): Promise<FilesFavoritesResponse>;
  addFilesFavorite(input: {
    scope: FilesFavoritesScope;
    sessionId?: string;
    path: string;
  }): Promise<FilesFavoritesResponse>;
  removeFilesFavorite(input: {
    scope: FilesFavoritesScope;
    sessionId?: string;
    path: string;
  }): Promise<FilesFavoritesResponse>;
  /** Absolute URL for streaming a file's binary content (with auth token).
      Used by <img>, <video>, <audio>, and the office viewers. Range-aware
      so the browser's media controls can seek. */
  fileContentUrl(absPath: string): string;
  /** Fetch a file as UTF-8 text (truncated to maxBytes). For Monaco/Cherry. */
  fetchFileText(absPath: string, maxBytes?: number): Promise<FileTextResponse>;
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
  postFlow(sessionId: string, body: PostFlowBody): Promise<{ filename: string }>;
  postFile(sessionId: string, body: PostFileBody): Promise<{ filename: string }>;
  uploadAttachment(
    sessionId: string,
    input: UploadAttachmentInput,
  ): Promise<UploadAttachmentResponse>;
  /** Remove a staged (un-committed) attachment from disk. Resolves on
   *  204 (deleted) or on 409 (already committed — chip should still
   *  drop locally, the file remains on disk for the committed event). */
  deleteAttachment(sessionId: string, fileId: string): Promise<void>;
  listTodos(sessionId: string, assignedTo?: string): Promise<TodoListResponse>;
  search(
    query: string,
    sessionId?: string,
    scope?: "all",
    limit?: number,
  ): Promise<SearchHit[]>;
  listPresets(sessionId?: string): Promise<{ builtin: Preset[]; project: Preset[] }>;
  /* Returns the union of skills scanned from `.claude/skills`,
     `.codex/skills`, `.opencode/skills`, and `.skills/` walking upward from the
     server's CWD. When `agent` is set, only that agent's directory + the
     generic `.skills` are scanned. See kernel/skills/scanner.ts. */
  listSkills(agent?: string): Promise<{ skills: SkillRef[] }>;
}

function buildHeaders(token: string | null): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token !== null) h.Authorization = `Bearer ${token}`;
  return h;
}

function buildAuthHeaders(token: string | null): Record<string, string> {
  if (token === null) return {};
  return { Authorization: `Bearer ${token}` };
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
  async function del(path: string): Promise<unknown> {
    /* No body on DELETE → use auth-only headers. Fastify rejects requests
       with Content-Type: application/json + empty body
       (FST_ERR_CTP_EMPTY_JSON_BODY) so we must omit Content-Type here. */
    const res = await fetch(url(path), {
      method: "DELETE",
      headers: buildAuthHeaders(cfg.token),
    });
    return jsonOrThrow(res);
  }

  return {
    async listSessions() {
      const body = (await get("/sessions")) as ListSessionsResponse;
      return Array.isArray(body.sessions) ? body.sessions : [];
    },
    async listAllSessions() {
      const body = (await get("/sessions?scope=all")) as ListSessionsResponse;
      return Array.isArray(body.sessions) ? body.sessions : [];
    },
    async createSession(input) {
      return (await post("/sessions", input)) as SessionMeta;
    },
    async updateSession(sessionId, input) {
      return (await patch(
        `/sessions/${encodeURIComponent(sessionId)}`,
        input,
      )) as SessionMeta;
    },
    async deleteSession(sessionId, path) {
      const qs = new URLSearchParams();
      if (path !== undefined && path.length > 0) qs.set("path", path);
      const suffix = qs.toString();
      const res = await fetch(
        url(
          `/sessions/${encodeURIComponent(sessionId)}${suffix ? `?${suffix}` : ""}`,
        ),
        { method: "DELETE", headers: buildAuthHeaders(cfg.token) },
      );
      if (res.status === 204) return;
      await jsonOrThrow(res);
    },
    async forkSession(sourceSessionId, input) {
      return (await post(
        `/sessions/${encodeURIComponent(sourceSessionId)}/fork`,
        input,
      )) as ForkSessionResponse;
    },
    async listAllSessionEvents(kinds) {
      const qs = new URLSearchParams({ scope: "all" });
      if (kinds !== undefined && kinds.length > 0) {
        qs.set("kinds", kinds.join(","));
      }
      const body = (await get(
        `/sessions/events?${qs.toString()}`,
      )) as ListSessionEventsResponse;
      return Array.isArray(body.groups) ? body.groups : [];
    },
    async fsList(path) {
      return (await get(
        `/fs/list?path=${encodeURIComponent(path)}`,
      )) as FsListResponse;
    },
    async fsHome() {
      return (await get("/fs/home")) as { home: string; xdgConfigHome: string | null };
    },
    async getPaths() {
      return (await get("/paths")) as PathsResponse;
    },
    async setActivePath(path) {
      return (await post("/paths/active", { path })) as PathsResponse;
    },
    async clearActivePath() {
      return (await del("/paths/active")) as PathsResponse;
    },
    async removeKnownPath(path) {
      return (await del(
        `/paths/known?path=${encodeURIComponent(path)}`,
      )) as { knownPaths: string[] };
    },
    async addFavorite(input) {
      return (await post("/paths/favorites", input)) as {
        favorites: PathFavorite[];
      };
    },
    async removeFavorite(path) {
      return (await del(
        `/paths/favorites?path=${encodeURIComponent(path)}`,
      )) as { favorites: PathFavorite[] };
    },
    async renameFavorite(input) {
      return (await patch("/paths/favorites", input)) as {
        favorites: PathFavorite[];
      };
    },
    async fetchFilesTree(root) {
      return (await get(
        `/files/tree?root=${encodeURIComponent(root)}`,
      )) as FilesTreeResponse;
    },
    async fetchFilesFavorites(scope, sessionId) {
      const qs = new URLSearchParams({ scope });
      if (sessionId !== undefined && sessionId.length > 0) {
        qs.set("sessionId", sessionId);
      }
      return (await get(
        `/files/favorites?${qs.toString()}`,
      )) as FilesFavoritesResponse;
    },
    async addFilesFavorite(input) {
      return (await post(
        "/files/favorites",
        input,
      )) as FilesFavoritesResponse;
    },
    async removeFilesFavorite(input) {
      const qs = new URLSearchParams({ scope: input.scope, path: input.path });
      if (input.sessionId !== undefined && input.sessionId.length > 0) {
        qs.set("sessionId", input.sessionId);
      }
      return (await del(
        `/files/favorites?${qs.toString()}`,
      )) as FilesFavoritesResponse;
    },
    fileContentUrl(absPath) {
      const qs = new URLSearchParams({ path: absPath });
      if (cfg.token !== null && cfg.token.length > 0) {
        qs.set("token", cfg.token);
      }
      return `${cfg.baseUrl}/files/content?${qs.toString()}`;
    },
    async fetchFileText(absPath, maxBytes) {
      const qs = new URLSearchParams({ path: absPath });
      if (maxBytes !== undefined) qs.set("maxBytes", String(maxBytes));
      return (await get(`/files/text?${qs.toString()}`)) as FileTextResponse;
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
      if (params.path !== undefined) qs.set("path", params.path);
      const suffix = qs.toString();
      const path = `/sessions/${sessionId}/events${suffix ? `?${suffix}` : ""}`;
      const body = (await get(path)) as ListEventsResponse;
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
    async postFlow(sessionId, body) {
      return (await post(
        `/sessions/${sessionId}/events/flow`,
        body,
      )) as { filename: string };
    },
    async postFile(sessionId, body) {
      return (await post(
        `/sessions/${sessionId}/events/file`,
        body,
      )) as { filename: string };
    },
    async uploadAttachment(sessionId, input) {
      const form = new FormData();
      if (input.participant_id !== undefined) {
        form.set("participant_id", input.participant_id);
      }
      if (input.display_name !== undefined) {
        form.set("display_name", input.display_name);
      }
      if (input.description !== undefined) {
        form.set("description", input.description);
      }
      form.set("file", input.file);
      const res = await fetch(url(`/sessions/${sessionId}/attachments`), {
        method: "POST",
        headers: buildAuthHeaders(cfg.token),
        body: form,
      });
      return (await jsonOrThrow(res)) as UploadAttachmentResponse;
    },
    async deleteAttachment(sessionId, fileId) {
      const res = await fetch(
        url(`/sessions/${sessionId}/attachments/${fileId}`),
        { method: "DELETE", headers: buildAuthHeaders(cfg.token) },
      );
      /* 409 means the file is referenced by a committed event — the
         chip should still drop locally, the bytes stay. Anything else
         non-2xx is a real failure to surface. */
      if (res.status === 204 || res.status === 409) return;
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
    },
    async listTodos(sessionId, assignedTo) {
      const qs = new URLSearchParams();
      if (assignedTo !== undefined && assignedTo.length > 0) {
        qs.set("assigned_to", assignedTo);
      }
      const suffix = qs.toString();
      const path = `/sessions/${sessionId}/todos${suffix ? `?${suffix}` : ""}`;
      return (await get(path)) as TodoListResponse;
    },
    async search(query, sessionId, scope, limit) {
      const qs = new URLSearchParams({ q: query });
      if (sessionId !== undefined && sessionId.length > 0) {
        qs.set("session", sessionId);
      }
      if (scope !== undefined) qs.set("scope", scope);
      if (limit !== undefined) qs.set("limit", String(limit));
      const body = (await get(`/search?${qs.toString()}`)) as {
        hits: SearchHit[];
      };
      return Array.isArray(body.hits) ? body.hits : [];
    },
    async listPresets(sessionId) {
      const qs = new URLSearchParams();
      if (sessionId !== undefined && sessionId.length > 0) {
        qs.set("session", sessionId);
      }
      const suffix = qs.toString();
      const path = `/presets${suffix ? `?${suffix}` : ""}`;
      return (await get(path)) as { builtin: Preset[]; project: Preset[] };
    },
    async listSkills(agent) {
      const qs = new URLSearchParams();
      if (agent !== undefined && agent.length > 0) {
        qs.set("agent", agent);
      }
      const suffix = qs.toString();
      const path = `/skills${suffix ? `?${suffix}` : ""}`;
      return (await get(path)) as { skills: SkillRef[] };
    },
  };
}
