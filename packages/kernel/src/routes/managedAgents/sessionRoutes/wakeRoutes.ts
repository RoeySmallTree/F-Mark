import type { WakeSessionRequest, WakeSessionResponse } from "@f-mark/shared";
import type { FastifyInstance } from "fastify";
import type { ManagedAgentsRouteContext } from "../routeContext.js";
import { requireSessionBinding } from "./sessionBinding.js";

export function registerManagedAgentWakeRoutes(
  app: FastifyInstance,
  context: ManagedAgentsRouteContext,
): void {
  app.post<{
    Params: { id: string };
    Body: WakeSessionRequest;
  }>(
    "/sessions/:id/wake",
    async (
      req,
      reply,
    ): Promise<WakeSessionResponse | { error: string }> => {
      const sessionId = decodeURIComponent(req.params.id);
      const body = (req.body ?? {}) as WakeSessionRequest;
      const scoped = await requireSessionBinding({
        context,
        reply,
        sessionId,
        scopeInput: { path_id: body.path_id, root: body.root },
        required: true,
      });
      if (!scoped.ok) return scoped.body;

      const result = await context.wakeService.wake({
        sessionId,
        binding: scoped.binding,
        body,
      });
      reply.code(result.status);
      return result.body;
    },
  );
}
