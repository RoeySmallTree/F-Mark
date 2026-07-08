import type {
  IntegrationApplyResponse,
  IntegrationPreflightResponse,
  KillTerminalResponse,
  ManagedAgentsListResponse,
  ManagedAgentsStatusResponse,
  SpawnResponse,
  SpawnTerminalResponse,
  WakeSessionResponse,
} from "@f-mark/shared";

import type { ManagedAgentsClient } from "../managedAgents.js";
import { appendScopeQuery } from "../rootScope.js";
import type { ManagedAgentsRequest } from "./request.js";

type LifecycleMethods = Pick<
  ManagedAgentsClient,
  | "list"
  | "spawn"
  | "preflight"
  | "integrationApply"
  | "status"
  | "wakeSession"
  | "spawnTerminal"
  | "killTerminal"
>;

export function createManagedAgentLifecycleMethods(
  req: ManagedAgentsRequest,
): LifecycleMethods {
  return {
    list: () => req<ManagedAgentsListResponse>("GET", "/managed-agents"),
    spawn: (r) => req<SpawnResponse>("POST", "/managed-agents/spawn", r),
    preflight: (r) =>
      req<IntegrationPreflightResponse>("POST", "/managed-agents/preflight", r),
    integrationApply: (r) =>
      req<IntegrationApplyResponse>(
        "POST",
        "/managed-agents/integration-apply",
        r,
      ),
    status: (sessionId, scope) =>
      req<ManagedAgentsStatusResponse>("GET", statusPath(sessionId, scope)),
    wakeSession: (sessionId, body) =>
      req<WakeSessionResponse>(
        "POST",
        `/sessions/${encodeURIComponent(sessionId)}/wake`,
        body,
      ),
    spawnTerminal: (name) =>
      req<SpawnTerminalResponse>("POST", "/managed-agents/terminal", { name }),
    killTerminal: (tmuxSession) =>
      req<KillTerminalResponse>("DELETE", "/managed-agents/terminal", {
        tmux_session: tmuxSession,
      }),
  };
}

function statusPath(
  sessionId: string | undefined,
  scope: Parameters<ManagedAgentsClient["status"]>[1],
): string {
  const qs = new URLSearchParams();
  if (sessionId !== undefined) qs.set("session_id", sessionId);
  if (scope != null) appendScopeQuery(qs, scope);
  const q = qs.toString();
  return `/managed-agents/status${q.length > 0 ? `?${q}` : ""}`;
}
