import type { FastifyInstance } from "fastify";
import type { ManagedAgentsRouteContext } from "../routeContext.js";

export function registerManagedAgentStatusRoute(
  app: FastifyInstance,
  context: ManagedAgentsRouteContext,
): void {
  app.get<{
    Querystring: { session_id?: string; path_id?: string; root?: string };
  }>("/managed-agents/status", async (req, reply) => {
    const scoped = await context.optionalScopedBinding(req.query, reply);
    if (!scoped.ok) return scoped.body;
    return context.buildStatusRows(req.query.session_id, scoped.binding);
  });
}
