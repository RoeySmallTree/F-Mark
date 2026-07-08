import type {
  IntegrationScope,
  IntegrationPreflightRequest,
  SpawnRequest,
} from "@f-mark/shared";
import { scopeToBody, type RootScope } from "../../api/rootScope.js";

type ScopeBody = Partial<Pick<IntegrationPreflightRequest, "path_id" | "root">>;
export type AgentSpawnRequest = SpawnRequest & { scope?: IntegrationScope };

function scopeBody(rootScope: RootScope | null): ScopeBody {
  return rootScope !== null ? scopeToBody(rootScope) : {};
}

export function buildPreflightRequest(
  runtimeId: string,
  participantId: string,
  rootScope: RootScope | null,
): IntegrationPreflightRequest {
  return {
    runtime_id: runtimeId,
    participant_id: participantId,
    ...scopeBody(rootScope),
  };
}

export interface BuildSpawnRequestOptions {
  runtimeId: string;
  sessionId: string | null;
  rootScope: RootScope | null;
  participantId: string;
  suggestedName: string;
  accessMode: string;
  model: string;
  effort: string;
  setupScope?: IntegrationScope;
}

export function buildSpawnRequest({
  runtimeId,
  sessionId,
  rootScope,
  participantId,
  suggestedName,
  accessMode,
  model,
  effort,
  setupScope,
}: BuildSpawnRequestOptions): AgentSpawnRequest {
  return {
    runtime_id: runtimeId,
    session_id: sessionId ?? undefined,
    ...scopeBody(rootScope),
    suggested_participant_id: participantId,
    name: suggestedName,
    access_mode: accessMode,
    ...(model.length > 0 ? { model } : {}),
    ...(effort.length > 0 ? { effort } : {}),
    ...(setupScope !== undefined ? { scope: setupScope } : {}),
  };
}
