import type { FastifyInstance } from "fastify";
import type { ManagedAgentsRouteContext } from "./routeContext.js";
import { registerManagedAgentEnsureRoutes } from "./sessionRoutes/ensureRoutes.js";
import { registerManagedAgentInboxRoutes } from "./sessionRoutes/inboxRoutes.js";
import { registerManagedAgentWakeRoutes } from "./sessionRoutes/wakeRoutes.js";

export function registerManagedAgentSessionRoutes(
  app: FastifyInstance,
  context: ManagedAgentsRouteContext,
): void {
  registerManagedAgentInboxRoutes(app, context);
  registerManagedAgentEnsureRoutes(app, context);
  registerManagedAgentWakeRoutes(app, context);
}
