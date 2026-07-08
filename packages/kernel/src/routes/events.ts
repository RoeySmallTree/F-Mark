import type { FastifyInstance } from "fastify";
import type { Paths } from "../paths.js";
import type { Bus } from "../ws/bus.js";
import { normaliseDeps, type PathDeps } from "./pathDeps.js";
import { registerEventReadRoute } from "./events/readRoute.js";
import { registerEventWriteRoutes } from "./events/writeRoutes.js";

export function registerEventRoutes(
  app: FastifyInstance,
  pOrDeps: Paths | PathDeps,
  getBus: () => Bus,
): void {
  const deps = normaliseDeps(pOrDeps);
  registerEventWriteRoutes(app, deps, getBus);
  registerEventReadRoute(app, deps);
}
