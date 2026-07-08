import type { Paths } from "../../paths.js";
import type { PathContextRef } from "../../paths/contextRef.js";
import type { GlobalPaths } from "../../paths/global.js";
import type { AgentStateStore } from "../../services/agentState.js";

export interface UpdateParams {
  id: string;
}

export interface ScopeQuery {
  path_id?: string;
  root?: string;
}

export interface ParticipantRouteDeps {
  fallback: Paths;
  global?: GlobalPaths;
  ref?: PathContextRef;
}

export type ParticipantScopeResult =
  | { ok: true; paths: Paths; agentState: AgentStateStore }
  | { ok: false; status: number; body: Record<string, unknown> };

export function normaliseParticipantRouteDeps(
  pOrDeps: Paths | ParticipantRouteDeps,
): ParticipantRouteDeps {
  return "fallback" in pOrDeps ? pOrDeps : { fallback: pOrDeps };
}
