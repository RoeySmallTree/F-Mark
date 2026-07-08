import type { ManagedAgentControlRequest } from "@f-mark/shared";
import type { FastifyInstance } from "fastify";
import type { ManagedAgentsRouteContext } from "../routeContext.js";
import { setPausedRoute } from "./pauseAction.js";

export function registerManagedAgentPauseRoutes(
  app: FastifyInstance,
  context: ManagedAgentsRouteContext,
): void {
  app.post<{ Params: { id: string }; Body: ManagedAgentControlRequest }>(
    "/managed-agents/:id/pause",
    async (req, reply) => {
      return setPausedRoute(context, {
        encodedId: req.params.id,
        scopeInput: req.body ?? {},
        paused: true,
        reply,
      });
    },
  );

  app.post<{ Params: { id: string }; Body: ManagedAgentControlRequest }>(
    "/managed-agents/:id/resume",
    async (req, reply) => {
      return setPausedRoute(context, {
        encodedId: req.params.id,
        scopeInput: req.body ?? {},
        paused: false,
        reply,
      });
    },
  );
}
