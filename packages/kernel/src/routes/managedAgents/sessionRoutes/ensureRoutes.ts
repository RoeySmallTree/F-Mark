import type {
  EnsureManagedAgentsRequest,
  EnsureManagedAgentsResponse,
} from "@f-mark/shared";
import type { FastifyInstance } from "fastify";
import type { ManagedAgentsRouteContext } from "../routeContext.js";
import { requireSessionBinding } from "./sessionBinding.js";

export function registerManagedAgentEnsureRoutes(
  app: FastifyInstance,
  context: ManagedAgentsRouteContext,
): void {
  app.post<{
    Params: { id: string };
    Body: EnsureManagedAgentsRequest;
  }>(
    "/sessions/:id/ensure-managed-agents",
    async (
      req,
      reply,
    ): Promise<EnsureManagedAgentsResponse | { error: string }> => {
      const sessionId = decodeURIComponent(req.params.id);
      const body = (req.body ?? {}) as EnsureManagedAgentsRequest;
      const requested = body.target_participant_ids;
      if (requested !== undefined && !Array.isArray(requested)) {
        reply.code(400);
        return { error: "target_participant_ids must be an array" };
      }

      const scoped = await requireSessionBinding({
        context,
        reply,
        sessionId,
        scopeInput: { path_id: body.path_id, root: body.root },
        required: true,
      });
      if (!scoped.ok) return scoped.body;

      return context.resumeService.ensureForSession({
        sessionId,
        binding: scoped.binding,
        targetParticipantIds:
          requested !== undefined
            ? requested.map((value) => String(value))
            : undefined,
        includeNotActiveSkips: requested !== undefined,
        idleOnly: body.idle_only === true,
      });
    },
  );
}
