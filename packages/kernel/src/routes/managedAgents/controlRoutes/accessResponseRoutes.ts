import type {
  ManagedAccessResponseRequest,
  ManagedAccessResponseResponse,
} from "@f-mark/shared";
import type { FastifyInstance } from "fastify";
import { isValidParticipantId } from "../../../participants.js";
import {
  requireParticipantId,
  requireScopedBinding,
} from "../routeRequest.js";
import type { ManagedAgentsRouteContext } from "../routeContext.js";
import { accessResponseRouteOptions } from "./accessResponseSchema.js";

export function registerManagedAgentAccessResponseRoutes(
  app: FastifyInstance,
  context: ManagedAgentsRouteContext,
): void {
  app.post<{
    Params: { id: string; requestId: string };
    Body: ManagedAccessResponseRequest;
  }>(
    "/managed-agents/:id/access-requests/:requestId/respond",
    accessResponseRouteOptions,
    async (
      req,
      reply,
    ): Promise<ManagedAccessResponseResponse | { error: string }> => {
      const participant = requireParticipantId(req.params.id, reply);
      if (!participant.ok) return participant.body;
      const id = participant.id;
      const requestId = decodeURIComponent(req.params.requestId);
      if (!isValidParticipantId(req.body.participant_id)) {
        reply.code(400);
        return { error: "invalid participant_id" };
      }
      const scoped = await requireScopedBinding({
        scopeInput: req.body,
        reply,
        resolveScope: context.optionalRootBinding,
      });
      if (!scoped.ok) return scoped.body;
      const result = await context.accessResponseService.respond({
        participantId: id,
        requestId,
        binding: scoped.binding,
        body: req.body,
      });
      reply.code(result.status);
      return result.body;
    },
  );
}
