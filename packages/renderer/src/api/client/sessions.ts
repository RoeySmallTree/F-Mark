import type {
  EventKind,
  ForkSessionResponse,
  ListSessionEventsResponse,
  ListSessionsResponse,
  SessionEventGroup,
  SessionMeta,
} from "@f-mark/shared";

import type { Client, ListAllSessionEventsOptions } from "../client.js";
import { appendScopeQuery } from "../rootScope.js";
import { jsonOrThrow, type ApiHttpClient } from "./core.js";

const NO_LOOSE_STRING_VALUES = {
  all: "all",
} as const;

type SessionMethods = Pick<
  Client,
  | "listSessions"
  | "listAllSessions"
  | "createSession"
  | "updateSession"
  | "deleteSession"
  | "forkSession"
  | "listAllSessionEvents"
>;

export function createSessionMethods(http: ApiHttpClient): SessionMethods {
  async function listAllSessionEvents(
    kinds?: EventKind[],
    opts?: ListAllSessionEventsOptions & { withResponse: true },
  ): Promise<ListSessionEventsResponse>;
  async function listAllSessionEvents(
    kinds?: EventKind[],
    opts?: ListAllSessionEventsOptions,
  ): Promise<SessionEventGroup[]>;
  async function listAllSessionEvents(
    kinds?: EventKind[],
    opts?: ListAllSessionEventsOptions,
  ): Promise<ListSessionEventsResponse | SessionEventGroup[]> {
    const qs = new URLSearchParams({ scope: NO_LOOSE_STRING_VALUES.all });
    if (kinds !== undefined && kinds.length > 0) {
      qs.set("kinds", kinds.join(","));
    }
    if (opts?.incremental === true) {
      qs.set("incremental", "1");
    }
    if (opts?.since !== undefined && opts.since.length > 0) {
      qs.set("since", opts.since);
    }
    const body = await http.get<ListSessionEventsResponse>(
      `/sessions/events?${qs.toString()}`,
    );
    if (opts?.withResponse === true) {
      return {
        ...body,
        groups: Array.isArray(body.groups) ? body.groups : [],
      };
    }
    return Array.isArray(body.groups) ? body.groups : [];
  }

  return {
    async listSessions(scope) {
      const qs = new URLSearchParams();
      if (scope !== undefined) appendScopeQuery(qs, scope);
      const suffix = qs.toString();
      const body = await http.get<ListSessionsResponse>(
        `/sessions${suffix ? `?${suffix}` : ""}`,
      );
      return Array.isArray(body.sessions) ? body.sessions : [];
    },
    async listAllSessions() {
      const body = await http.get<ListSessionsResponse>("/sessions?scope=all");
      return Array.isArray(body.sessions) ? body.sessions : [];
    },
    async createSession(input) {
      return http.post<SessionMeta>("/sessions", input);
    },
    async updateSession(sessionId, input) {
      return http.patch<SessionMeta>(
        `/sessions/${encodeURIComponent(sessionId)}`,
        input,
      );
    },
    async deleteSession(sessionId, pathOrScope) {
      const qs = new URLSearchParams();
      if (typeof pathOrScope === "string" && pathOrScope.length > 0) {
        qs.set("path", pathOrScope);
      } else if (pathOrScope !== undefined && typeof pathOrScope !== "string") {
        appendScopeQuery(qs, pathOrScope);
      }
      const suffix = qs.toString();
      const res = await http.fetchRaw(
        `/sessions/${encodeURIComponent(sessionId)}${suffix ? `?${suffix}` : ""}`,
        { method: "DELETE", headers: http.authHeaders() },
      );
      if (res.status === 204) return;
      await jsonOrThrow(res);
    },
    async forkSession(sourceSessionId, input) {
      return http.post<ForkSessionResponse>(
        `/sessions/${encodeURIComponent(sourceSessionId)}/fork`,
        input,
      );
    },
    listAllSessionEvents,
  };
}
