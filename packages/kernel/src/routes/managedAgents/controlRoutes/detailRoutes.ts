import type {
  ManagedAgentAccessPatch,
  ManagedAgentRenameRequest,
} from "@f-mark/shared";
import type { FastifyInstance } from "fastify";
import { requireParticipantId } from "../routeRequest.js";
import type { ManagedAgentsRouteContext } from "../routeContext.js";
import { updateAccessMode } from "./accessModeAction.js";
import { renameAgent } from "./renameAction.js";
import { readAgentStatusField } from "./statusField.js";

export function registerManagedAgentDetailRoutes(
  app: FastifyInstance,
  context: ManagedAgentsRouteContext,
): void {
  registerRenameRoute(app, context);
  registerContextRoute(app, context);
  registerAccessRoutes(app, context);
}

function registerRenameRoute(
  app: FastifyInstance,
  context: ManagedAgentsRouteContext,
): void {
  app.patch<{
    Params: { id: string };
    Body: ManagedAgentRenameRequest;
  }>("/managed-agents/:id", async (req, reply) => {
    const participant = requireParticipantId(req.params.id, reply);
    if (!participant.ok) return participant.body;
    const scoped = await context.optionalScopedBinding(req.body ?? {}, reply);
    if (!scoped.ok) return scoped.body;
    return renameAgent(context, {
      id: participant.id,
      displayName: req.body?.display_name,
      binding: scoped.binding,
      reply,
    });
  });
}

function registerContextRoute(
  app: FastifyInstance,
  context: ManagedAgentsRouteContext,
): void {
  app.get<{ Params: { id: string } }>(
    "/managed-agents/:id/context",
    async (req, reply) => {
      return readAgentStatusField(
        context,
        req.params.id,
        reply,
        (agent) => agent.context,
      );
    },
  );
}

function registerAccessRoutes(
  app: FastifyInstance,
  context: ManagedAgentsRouteContext,
): void {
  app.get<{ Params: { id: string } }>(
    "/managed-agents/:id/access",
    async (req, reply) => {
      return readAgentStatusField(
        context,
        req.params.id,
        reply,
        (agent) => agent.access,
      );
    },
  );

  app.patch<{
    Params: { id: string };
    Body: ManagedAgentAccessPatch;
  }>("/managed-agents/:id/access", async (req, reply) => {
    const scoped = await context.optionalScopedParticipant(
      req.params.id,
      req.body ?? {},
      reply,
    );
    if (!scoped.ok) return scoped.body;
    return updateAccessMode(context, {
      id: scoped.id,
      mode: req.body?.mode,
      binding: scoped.binding,
      reply,
    });
  });
}
