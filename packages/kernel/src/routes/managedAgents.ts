import type { FastifyInstance } from "fastify";
import { registerManagedAgentCommandRoutes } from "./managedAgents/commandRoutes.js";
import { registerManagedAgentControlRoutes } from "./managedAgents/controlRoutes.js";
import { registerManagedAgentIntegrationRoutes } from "./managedAgents/integrationRoutes.js";
import { makeManagedAgentsOriginHook } from "./managedAgents/originHook.js";
import {
  createManagedAgentsRouteContext,
  startManagedAgentsIdleSweeper,
} from "./managedAgents/routeContext.js";
import { registerManagedAgentRuntimeRoutes } from "./managedAgents/runtimeRoutes.js";
import { registerManagedAgentSessionRoutes } from "./managedAgents/sessionRoutes.js";
import { registerManagedAgentSpawnRoutes } from "./managedAgents/spawnRoutes.js";
import type { ManagedAgentsDeps } from "./managedAgents/types.js";

export type { ManagedAgentsDeps } from "./managedAgents/types.js";
export { applyRuntimeOverride } from "./managedAgents/runtimeArgs.js";

export function registerManagedAgentsRoutes(
  app: FastifyInstance,
  deps: ManagedAgentsDeps,
): void {
  const context = createManagedAgentsRouteContext(deps);

  // Defence-in-depth: gate cookie-authenticated mutating requests by Origin.
  // Registered before the routes so it runs on every /managed-agents/* call.
  app.addHook("preHandler", makeManagedAgentsOriginHook());

  registerManagedAgentIntegrationRoutes(app, context);
  startManagedAgentsIdleSweeper(app, context);
  registerManagedAgentControlRoutes(app, context);
  registerManagedAgentSessionRoutes(app, context);
  registerManagedAgentSpawnRoutes(app, context);
  registerManagedAgentRuntimeRoutes(app, context);
  registerManagedAgentCommandRoutes(app, context);
}
