import type { FastifyInstance } from "fastify";
import { registerManagedAgentAccessResponseRoutes } from "./controlRoutes/accessResponseRoutes.js";
import { registerManagedAgentDetailRoutes } from "./controlRoutes/detailRoutes.js";
import { registerManagedAgentPauseRoutes } from "./controlRoutes/pauseRoutes.js";
import { registerManagedAgentRuntimeControlRoutes } from "./controlRoutes/runtimeControlRoutes.js";
import { registerManagedAgentStatusRoute } from "./controlRoutes/statusRoute.js";
import type { ManagedAgentsRouteContext } from "./routeContext.js";

export function registerManagedAgentControlRoutes(
  app: FastifyInstance,
  context: ManagedAgentsRouteContext,
): void {
  registerManagedAgentStatusRoute(app, context);
  registerManagedAgentPauseRoutes(app, context);
  registerManagedAgentDetailRoutes(app, context);
  registerManagedAgentAccessResponseRoutes(app, context);
  registerManagedAgentRuntimeControlRoutes(app, context);
}
