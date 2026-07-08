import type { FastifyInstance } from "fastify";
import type { Paths } from "../paths.js";
import type { Bus } from "../ws/bus.js";
import { registerSessionCreateRoute } from "./sessions/createRoute.js";
import { SessionEventsService } from "./sessions/eventsService.js";
import { registerSessionForkRoute } from "./sessions/forkRoute.js";
import { SessionForkService } from "./sessions/forkService.js";
import { registerSessionListRoutes } from "./sessions/listRoutes.js";
import { registerSessionMutationRoutes } from "./sessions/mutationRoutes.js";
import { SessionPathResolver } from "./sessions/pathResolver.js";
import type { SessionRouteDeps } from "./sessions/types.js";

export type { SessionRouteDeps } from "./sessions/types.js";

export function registerSessionRoutes(
  app: FastifyInstance,
  pOrDeps: Paths | SessionRouteDeps,
  getBus?: () => Bus,
): void {
  const deps: SessionRouteDeps =
    "fallback" in pOrDeps ? pOrDeps : { fallback: pOrDeps };
  const pathResolver = new SessionPathResolver(deps);
  const eventsService = new SessionEventsService(deps, pathResolver);
  const forkService = new SessionForkService({
    deps,
    getBus,
    paths: pathResolver,
  });

  registerSessionListRoutes(app, pathResolver, eventsService);
  registerSessionCreateRoute(app, deps, pathResolver);
  registerSessionMutationRoutes(app, pathResolver, deps, getBus);
  registerSessionForkRoute(app, forkService);
}
