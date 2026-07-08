import type { ManagedAgentControlRequest } from "@f-mark/shared";
import type { FastifyInstance } from "fastify";
import { readLaunchDefaults } from "../../mcpInstall/scopePreference.js";
import { globalPaths, resolveConfigRoot } from "../../paths/global.js";
import { getAdapter } from "../../runtimes/adapters/index.js";
import type { ManagedAgentsRouteContext } from "./routeContext.js";
import { modelsForRuntime } from "./spawnRoutes/listRoutes.js";

export function registerManagedAgentRuntimeRoutes(
  app: FastifyInstance,
  context: ManagedAgentsRouteContext,
): void {
  app.get<{
    Params: { runtimeId: string };
    Querystring: { refresh?: string };
  }>("/runtimes/:runtimeId/models", async (req, reply) => {
    const adapter = getAdapter(req.params.runtimeId);
    if (adapter === null) {
      reply.code(400);
      return { error: `runtime has no adapter: ${req.params.runtimeId}` };
    }
    try {
      const [models, defaults] = await Promise.all([
        modelsForRuntime(req.params.runtimeId, {
          refresh: isRefreshRequested(req.query.refresh),
          swallowErrors: false,
        }),
        readLaunchDefaults(
          req.params.runtimeId,
          globalPaths(resolveConfigRoot(context.integrationEnv)),
        ),
      ]);
      return {
        models,
        ...(defaults.model !== undefined ? { default_model: defaults.model } : {}),
        ...(defaults.effort !== undefined
          ? { default_effort: defaults.effort }
          : {}),
        ...(defaults.access_mode !== undefined
          ? { default_access_mode: defaults.access_mode }
          : {}),
      };
    } catch (e) {
      reply.code(502);
      return { error: e instanceof Error ? e.message : String(e) };
    }
  });

  app.get<{
    Params: { runtimeId: string };
    Querystring: { model?: string };
  }>("/runtimes/:runtimeId/efforts", async (req, reply) => {
    const adapter = getAdapter(req.params.runtimeId);
    if (adapter === null) {
      reply.code(400);
      return { error: `runtime has no adapter: ${req.params.runtimeId}` };
    }
    try {
      return { efforts: await adapter.listEfforts(req.query.model) };
    } catch (e) {
      reply.code(502);
      return { error: e instanceof Error ? e.message : String(e) };
    }
  });

  app.post<{ Params: { id: string }; Body: unknown }>(
    "/managed-agents/:id/runtime-state",
    async (req, reply) => {
      const body = (req.body ?? {}) as { path_id?: unknown; root?: unknown };
      const scoped = await context.optionalScopedParticipant(
        req.params.id,
        { path_id: body.path_id, root: body.root },
        reply,
      );
      if (!scoped.ok) return scoped.body;
      const result = await context.runtimeService.recordRuntimeState({
        participantId: scoped.id,
        body: req.body,
        binding: scoped.binding,
      });
      reply.code(result.status);
      return result.body;
    },
  );

  app.get<{
    Params: { id: string };
    Querystring: { path_id?: string; root?: string };
  }>(
    "/managed-agents/:id/runtime/state",
    async (req, reply) => {
      const scoped = await context.optionalScopedParticipant(
        req.params.id,
        req.query,
        reply,
      );
      if (!scoped.ok) return scoped.body;
      return context.runtimeService.runtimeState(scoped.id, scoped.binding);
    },
  );

  app.get<{
    Params: { id: string };
    Querystring: { refresh?: string; path_id?: string; root?: string };
  }>(
    "/managed-agents/:id/runtime/models",
    async (req, reply) => {
      const scoped = await context.optionalScopedParticipant(
        req.params.id,
        req.query,
        reply,
      );
      if (!scoped.ok) return scoped.body;
      const result = await context.runtimeService.listModels({
        participantId: scoped.id,
        binding: scoped.binding,
        refresh: req.query.refresh === "true",
      });
      reply.code(result.status);
      return result.body;
    },
  );

  app.get<{
    Params: { id: string };
    Querystring: { model?: string; path_id?: string; root?: string };
  }>("/managed-agents/:id/runtime/efforts", async (req, reply) => {
    const scoped = await context.optionalScopedParticipant(
      req.params.id,
      req.query,
      reply,
    );
    if (!scoped.ok) return scoped.body;
    const result = await context.runtimeService.listEfforts({
      participantId: scoped.id,
      binding: scoped.binding,
      model: req.query.model,
    });
    reply.code(result.status);
    return result.body;
  });

  app.put<{
    Params: { id: string };
    Body: ManagedAgentControlRequest & {
      model?: string | null;
      effort?: string | null;
      restart?: boolean;
    };
  }>("/managed-agents/:id/runtime", async (req, reply) => {
    const scoped = await context.optionalScopedParticipant(
      req.params.id,
      req.body ?? {},
      reply,
    );
    if (!scoped.ok) return scoped.body;
    const result = await context.runtimeService.updateRuntime({
      participantId: scoped.id,
      binding: scoped.binding,
      body: req.body ?? {},
    });
    reply.code(result.status);
    return result.body;
  });
}

function isRefreshRequested(refresh: string | undefined): boolean {
  return refresh === "1" || refresh === "true";
}
