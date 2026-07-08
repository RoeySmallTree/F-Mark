import type {
  EnsureManagedAgentsResponse,
  ListEventsResponse,
  TodoListResponse,
  UploadAttachmentResponse,
} from "@f-mark/shared";

import type { Client } from "../client.js";
import { appendScopeQuery, scopeToBody, type RootScope } from "../rootScope.js";
import { jsonOrThrow, type ApiHttpClient } from "./core.js";

type EventMethods = Pick<
  Client,
  | "listEvents"
  | "postProse"
  | "postTurnEnd"
  | "postChoice"
  | "postTodo"
  | "postHtml"
  | "postFlow"
  | "postFile"
  | "ensureManagedAgents"
  | "uploadAttachment"
  | "deleteAttachment"
  | "listTodos"
>;

export function createEventMethods(http: ApiHttpClient): EventMethods {
  return {
    async listEvents(sessionId, scope, params) {
      const qs = new URLSearchParams();
      appendScopeQuery(qs, scope);
      if (params?.since !== undefined) qs.set("since", params.since);
      if (params?.kinds !== undefined) qs.set("kinds", params.kinds.join(","));
      if (params?.participant !== undefined) {
        qs.set("participant", params.participant);
      }
      const path = `/sessions/${sessionId}/events?${qs.toString()}`;
      const body = await http.get<ListEventsResponse>(path);
      return body.events;
    },
    async postProse(sessionId, body, scope) {
      return http.post<{ filename: string }>(`/sessions/${sessionId}/events/prose`, {
        ...body,
        ...scopeToBody(scope),
      });
    },
    async postTurnEnd(sessionId, participantId, scope) {
      return http.post<{ filename: string }>(
        `/sessions/${sessionId}/events/turn-end`,
        {
          participant_id: participantId,
          ...scopeToBody(scope),
        },
      );
    },
    async postChoice(sessionId, body, scope) {
      return http.post<{ filename: string }>(
        `/sessions/${sessionId}/events/choice`,
        {
          ...body,
          ...scopeToBody(scope),
        },
      );
    },
    async postTodo(sessionId, body, scope) {
      return http.post<{ filename: string }>(`/sessions/${sessionId}/events/todo`, {
        ...body,
        ...scopeToBody(scope),
      });
    },
    async postHtml(sessionId, body, scope) {
      return http.post<{ filename: string }>(`/sessions/${sessionId}/events/html`, {
        ...body,
        ...scopeToBody(scope),
      });
    },
    async postFlow(sessionId, body, scope) {
      return http.post<{ filename: string }>(`/sessions/${sessionId}/events/flow`, {
        ...body,
        ...scopeToBody(scope),
      });
    },
    async postFile(sessionId, body, scope) {
      return http.post<{ filename: string }>(`/sessions/${sessionId}/events/file`, {
        ...body,
        ...scopeToBody(scope),
      });
    },
    async ensureManagedAgents(sessionId, scope, body = {}) {
      return http.post<EnsureManagedAgentsResponse>(
        `/sessions/${sessionId}/ensure-managed-agents`,
        {
          ...body,
          ...scopeToBody(scope),
        },
      );
    },
    async uploadAttachment(sessionId, input, scope) {
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
      const qs = new URLSearchParams();
      if (scope !== undefined) appendScopeQuery(qs, scope);
      const suffix = qs.toString();
      const res = await http.fetchRaw(
        `/sessions/${sessionId}/attachments${suffix ? `?${suffix}` : ""}`,
        {
          method: "POST",
          headers: http.authHeaders(),
          body: form,
        },
      );
      const body = await jsonOrThrow(res);
      return body as UploadAttachmentResponse;
    },
    async deleteAttachment(sessionId, fileId, scope) {
      const qs = new URLSearchParams();
      if (scope !== undefined) appendScopeQuery(qs, scope);
      const suffix = qs.toString();
      const res = await http.fetchRaw(
        `/sessions/${sessionId}/attachments/${fileId}${suffix ? `?${suffix}` : ""}`,
        { method: "DELETE", headers: http.authHeaders() },
      );
      /* 409 means the file is referenced by a committed event: the chip should
         still drop locally, while the bytes stay for the committed event. */
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
    async listTodos(
      sessionId: string,
      scopeOrAssignedTo?: RootScope | string,
      assignedTo?: string,
    ) {
      const qs = new URLSearchParams();
      const scope =
        typeof scopeOrAssignedTo === "string" ? undefined : scopeOrAssignedTo;
      const assignee =
        typeof scopeOrAssignedTo === "string" ? scopeOrAssignedTo : assignedTo;
      if (scope !== undefined) appendScopeQuery(qs, scope);
      if (assignee !== undefined && assignee.length > 0) {
        qs.set("assigned_to", assignee);
      }
      const suffix = qs.toString();
      const path = `/sessions/${sessionId}/todos${suffix ? `?${suffix}` : ""}`;
      return http.get<TodoListResponse>(path);
    },
  };
}
