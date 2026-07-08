import type { FastifyInstance } from "fastify";
import type { ManagedAgentsRouteContext } from "./routeContext.js";
import { registerLifecycleRoutes } from "./spawnRoutes/lifecycleRoutes.js";
import { registerManagedAgentListRoutes } from "./spawnRoutes/listRoutes.js";
import { registerSpawnRoute } from "./spawnRoutes/spawnRoute.js";
import {
  registerTerminalKillRoute,
  registerTerminalSpawnRoute,
} from "./spawnRoutes/terminalRoutes.js";
import type { ConfirmTokenStore } from "./spawnRoutes/confirmTokens.js";

export function registerManagedAgentSpawnRoutes(
  app: FastifyInstance,
  context: ManagedAgentsRouteContext,
): void {
  const confirmTokens: ConfirmTokenStore = new Map();

  registerSpawnRoute(app, context);
  registerLifecycleRoutes(app, context, confirmTokens);
  registerTerminalSpawnRoute(app, context);
  registerTerminalKillRoute(app, context);
  registerManagedAgentListRoutes(app, context);
}
