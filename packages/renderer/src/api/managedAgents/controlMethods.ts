import type {
  ManagedAccessResponseResponse,
  ManagedAgentCommandResponse,
  ManagedAgentConfirmTokenResponse,
  ManagedAgentControlResponse,
  ManagedAgentGoodbyeResponse,
  ManagedAgentLogsResponse,
} from "@f-mark/shared";

import type { ManagedAgentsClient } from "../managedAgents.js";
import { appendScopeQuery, scopeToBody } from "../rootScope.js";
import type { ManagedAgentsRequest } from "./request.js";

type ControlMethods = Pick<
  ManagedAgentsClient,
  | "pause"
  | "resume"
  | "rename"
  | "reconnect"
  | "compact"
  | "clear"
  | "context"
  | "access"
  | "setAccess"
  | "respondAccessRequest"
  | "getConfirmToken"
  | "goodbye"
  | "command"
  | "logs"
>;

type AgentScope = Parameters<ManagedAgentsClient["pause"]>[1];

export function createManagedAgentControlMethods(
  req: ManagedAgentsRequest,
): ControlMethods {
  return {
    pause: (id, scope) =>
      req<ManagedAgentControlResponse>("POST", agentPath(id, "/pause"), scopedBody(scope)),
    resume: (id, scope) =>
      req<ManagedAgentControlResponse>("POST", agentPath(id, "/resume"), scopedBody(scope)),
    rename: (id, body, scope) =>
      req<ManagedAgentControlResponse>("PATCH", agentPath(id), withScope(body, scope)),
    reconnect: (id, scope) =>
      req<ManagedAgentControlResponse>(
        "POST",
        agentPath(id, "/reconnect"),
        scopedBody(scope),
      ),
    compact: (id, scope) =>
      req<ManagedAgentControlResponse>("POST", agentPath(id, "/compact"), scopedBody(scope)),
    clear: (id, scope) =>
      req<ManagedAgentControlResponse>("POST", agentPath(id, "/clear"), scopedBody(scope)),
    context: (id) =>
      req<ManagedAgentControlResponse["agent"]["context"]>(
        "GET",
        agentPath(id, "/context"),
      ),
    access: (id) =>
      req<ManagedAgentControlResponse["agent"]["access"]>(
        "GET",
        agentPath(id, "/access"),
      ),
    setAccess: (id, body, scope) =>
      req<ManagedAgentControlResponse>(
        "PATCH",
        agentPath(id, "/access"),
        withScope(body, scope),
      ),
    respondAccessRequest: (id, requestId, body) =>
      req<ManagedAccessResponseResponse>(
        "POST",
        agentPath(id, `/access-requests/${encodeURIComponent(requestId)}/respond`),
        body,
      ),
    getConfirmToken: async (id) => {
      const r = await req<ManagedAgentConfirmTokenResponse>(
        "GET",
        agentPath(id, "/confirm-token"),
      );
      return r.token;
    },
    goodbye: (id, confirmToken, scope, intent) => {
      void intent;
      return req<ManagedAgentGoodbyeResponse>(
        "DELETE",
        goodbyePath(id, confirmToken, scope),
      );
    },
    command: (id, body, scope) =>
      req<ManagedAgentCommandResponse>(
        "POST",
        agentPath(id, "/command"),
        withScope(body, scope),
      ),
    logs: (id, limit) =>
      req<ManagedAgentLogsResponse>("GET", `${agentPath(id, "/logs")}${logsQuery(limit)}`),
  };
}

function agentPath(participantId: string, suffix = ""): string {
  return `/managed-agents/${encodeURIComponent(participantId)}${suffix}`;
}

function scopedBody(scope: AgentScope): ReturnType<typeof scopeToBody> | undefined {
  return scope != null ? scopeToBody(scope) : undefined;
}

function withScope<T extends object>(body: T, scope: AgentScope): T {
  return { ...body, ...(scope != null ? scopeToBody(scope) : {}) };
}

function goodbyePath(
  participantId: string,
  confirmToken: string,
  scope: AgentScope,
): string {
  const qs = new URLSearchParams({ confirm: confirmToken });
  if (scope != null) appendScopeQuery(qs, scope);
  return `${agentPath(participantId)}?${qs.toString()}`;
}

function logsQuery(limit: number | undefined): string {
  return limit !== undefined ? `?since=${limit}` : "";
}
