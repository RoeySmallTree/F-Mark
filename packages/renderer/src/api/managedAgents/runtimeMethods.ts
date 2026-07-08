import type {
  EffortDescriptor,
  EnvProbeResult,
  ManagedAgentControlResponse,
  ModelDescriptor,
  RuntimesFile,
} from "@f-mark/shared";

import type {
  ManagedAgentsClient,
  RuntimeCatalogModelsResponse,
} from "../managedAgents.js";
import { appendScopeQuery, scopeToBody } from "../rootScope.js";
import type { ManagedAgentsRequest } from "./request.js";

type RuntimeMethods = Pick<
  ManagedAgentsClient,
  | "runtimeModels"
  | "runtimeEfforts"
  | "runtimeCatalogModels"
  | "runtimeCatalogEfforts"
  | "setRuntime"
  | "envProbe"
  | "refreshEnvProbe"
  | "listRuntimes"
  | "upsertRuntime"
  | "removeRuntime"
>;

export function createManagedAgentRuntimeMethods(
  req: ManagedAgentsRequest,
): RuntimeMethods {
  return {
    runtimeModels: (id, opts) =>
      req<{ models: ModelDescriptor[] }>(
        "GET",
        `${agentRuntimePath(id, "/models")}${runtimeModelsQuery(opts)}`,
      ).then((r) => r.models),
    runtimeEfforts: (id, model, scope) =>
      req<{ efforts: EffortDescriptor[] }>(
        "GET",
        `${agentRuntimePath(id, "/efforts")}${modelQuery(model, scope)}`,
      ).then((r) => r.efforts),
    runtimeCatalogModels: (id, opts) =>
      req<RuntimeCatalogModelsResponse>(
        "GET",
        `${runtimeCatalogPath(id, "/models")}${runtimeCatalogModelsQuery(opts)}`,
      ),
    runtimeCatalogEfforts: (id, model) =>
      req<{ efforts: EffortDescriptor[] }>(
        "GET",
        `${runtimeCatalogPath(id, "/efforts")}${runtimeCatalogEffortsQuery(model)}`,
      ).then((r) => r.efforts),
    setRuntime: (id, body, scope) =>
      req<{ ok: true; state: ManagedAgentControlResponse["agent"]["runtime_state"] }>(
        "PUT",
        agentRuntimePath(id),
        withScope(body, scope),
      ),
    envProbe: () => req<EnvProbeResult>("GET", "/env-probe"),
    refreshEnvProbe: () => req<EnvProbeResult>("POST", "/env-probe/refresh"),
    listRuntimes: () => req<RuntimesFile>("GET", "/runtimes"),
    upsertRuntime: (id, entry) =>
      req<RuntimesFile>("PUT", `/runtimes/${encodeURIComponent(id)}`, entry),
    removeRuntime: (id) =>
      req<RuntimesFile>("DELETE", `/runtimes/${encodeURIComponent(id)}`),
  };
}

function agentRuntimePath(participantId: string, suffix = ""): string {
  return `/managed-agents/${encodeURIComponent(participantId)}/runtime${suffix}`;
}

function runtimeCatalogPath(runtimeId: string, suffix: string): string {
  return `/runtimes/${encodeURIComponent(runtimeId)}${suffix}`;
}

function runtimeModelsQuery(
  opts: Parameters<ManagedAgentsClient["runtimeModels"]>[1],
): string {
  const qs = new URLSearchParams();
  if (opts?.refresh === true) qs.set("refresh", "true");
  if (opts?.scope != null) appendScopeQuery(qs, opts.scope);
  const query = qs.toString();
  return query.length > 0 ? `?${query}` : "";
}

function runtimeCatalogModelsQuery(
  opts: Parameters<ManagedAgentsClient["runtimeCatalogModels"]>[1],
): string {
  const qs = new URLSearchParams();
  if (opts?.refresh === true) qs.set("refresh", "1");
  const query = qs.toString();
  return query.length > 0 ? `?${query}` : "";
}

function runtimeCatalogEffortsQuery(model: string | undefined): string {
  const qs = new URLSearchParams();
  if (model !== undefined && model.length > 0) qs.set("model", model);
  const query = qs.toString();
  return query.length > 0 ? `?${query}` : "";
}

function modelQuery(
  model: string | undefined,
  scope: Parameters<ManagedAgentsClient["runtimeEfforts"]>[2],
): string {
  const qs = new URLSearchParams();
  if (model !== undefined && model.length > 0) qs.set("model", model);
  if (scope != null) appendScopeQuery(qs, scope);
  const query = qs.toString();
  return query.length > 0 ? `?${query}` : "";
}

function withScope<T extends object>(
  body: T,
  scope: Parameters<ManagedAgentsClient["setRuntime"]>[2],
): T {
  return { ...body, ...(scope != null ? scopeToBody(scope) : {}) };
}
