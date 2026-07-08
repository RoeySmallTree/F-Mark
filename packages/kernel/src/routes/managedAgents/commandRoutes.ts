import type { ManagedAgentCommandRequest } from "@f-mark/shared";
import type { FastifyInstance } from "fastify";
import { requireScopedParticipant } from "./routeRequest.js";
import type { ManagedAgentsRouteContext } from "./routeContext.js";

export function registerManagedAgentCommandRoutes(
  app: FastifyInstance,
  context: ManagedAgentsRouteContext,
): void {
  app.post<{
    Params: { id: string };
    Body: Partial<ManagedAgentCommandRequest>;
  }>("/managed-agents/:id/command", async (req, reply) => {
    const scoped = await requireScopedParticipant({
      encodedId: req.params.id,
      scopeInput: req.body ?? {},
      reply,
      resolveScope: context.optionalRootBinding,
    });
    if (!scoped.ok) return scoped.body;
    const body = (req.body ?? {}) as Partial<ManagedAgentCommandRequest>;
    const result = await context.commandService.send({
      participantId: scoped.id,
      binding: scoped.binding,
      body,
    });
    reply.code(result.status);
    return result.body;
  });
}
