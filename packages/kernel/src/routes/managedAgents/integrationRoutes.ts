import type {
  IntegrationApplyRequest,
  IntegrationPreflightRequest,
} from "@f-mark/shared";
import type { FastifyInstance } from "fastify";
import { resolveChosenScope } from "../../mcpInstall/scopePreference.js";
import { globalPaths, resolveConfigRoot } from "../../paths/global.js";
import { loadRuntimeRegistry } from "../../runtimes/store.js";
import { preflightRegisteredIntegration } from "./launchService.js";
import { requireScopedBinding } from "./routeRequest.js";
import type { ManagedAgentsRouteContext } from "./routeContext.js";

export function registerManagedAgentIntegrationRoutes(
  app: FastifyInstance,
  context: ManagedAgentsRouteContext,
): void {
  app.post<{ Body: IntegrationPreflightRequest }>(
    "/managed-agents/preflight",
    {
      schema: {
        body: {
          type: "object",
          required: ["runtime_id"],
          additionalProperties: false,
          properties: {
            runtime_id: { type: "string", minLength: 1 },
            participant_id: { type: "string" },
            path_id: { type: "string", minLength: 1 },
            root: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (req, reply) => {
      const scoped = await requireScopedBinding({
        scopeInput: req.body,
        reply,
        resolveScope: context.optionalRootBinding,
      });
      if (!scoped.ok) return scoped.body;
      const p = scoped.binding.paths;
      const chosen = await resolveChosenScope(
        req.body.runtime_id,
        globalPaths(resolveConfigRoot(context.integrationEnv)),
      );
      return preflightRegisteredIntegration({
        runtimeId: req.body.runtime_id,
        participantId: req.body.participant_id,
        userParticipantId: await context.firstUserParticipantId(p),
        projectRoot: p.root(),
        chosenScope: chosen.integrationScope,
        registryDeps: {
          fallback: context.paths,
          ref: context.pathContextRef,
        },
        env: context.integrationEnv,
      });
    },
  );

  app.post<{ Body: IntegrationApplyRequest }>(
    "/managed-agents/integration-apply",
    {
      schema: {
        body: {
          type: "object",
          required: ["runtime_id"],
          additionalProperties: false,
          properties: {
            runtime_id: { type: "string", minLength: 1 },
            participant_id: { type: "string" },
            path_id: { type: "string", minLength: 1 },
            root: { type: "string", minLength: 1 },
            scope: {
              type: "string",
              enum: ["project", "user", "local"],
            },
          },
        },
      },
    },
    async (req, reply) => {
      const scoped = await requireScopedBinding({
        scopeInput: req.body,
        reply,
        resolveScope: context.optionalRootBinding,
      });
      if (!scoped.ok) return scoped.body;
      const binding = scoped.binding;
      const p = binding.paths;
      await context.ensureLaunchProjectConnection(p);
      const runtimes = await loadRuntimeRegistry({
        fallback: context.paths,
        ref: context.pathContextRef,
      });
      if (runtimes.runtimes[req.body.runtime_id] === undefined) {
        reply.code(409);
        return {
          error: `runtime_id is not registered for launch: ${req.body.runtime_id}`,
        };
      }
      try {
        return await context.applyIntegrationWithManagedCleanup({
          runtimeId: req.body.runtime_id,
          executable: runtimes.runtimes[req.body.runtime_id]?.executable,
          participantId: req.body.participant_id,
          userParticipantId: await context.firstUserParticipantId(p),
          scope: req.body.scope,
          projectRoot: p.root(),
          env: context.integrationEnv,
          p,
          state: binding.state,
        });
      } catch (err) {
        reply.code(409);
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  );
}
