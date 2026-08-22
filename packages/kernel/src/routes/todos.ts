import type { FastifyInstance } from "fastify";
import type { Paths } from "../paths.js";
import type { Bus } from "../ws/bus.js";
import { normaliseDeps, type PathDeps } from "./pathDeps.js";
import { TodoRouteContext } from "./todos/context.js";
import { registerTodoDescendantsRoute } from "./todos/descendantsRoute.js";
import { registerTodoReadRoute } from "./todos/readRoute.js";
import { registerTodoWriteRoute } from "./todos/writeRoute.js";

export function registerTodoRoutes(
  app: FastifyInstance,
  pOrDeps: Paths | PathDeps,
  getBus: () => Bus,
): void {
  const context = new TodoRouteContext(normaliseDeps(pOrDeps), getBus);
  registerTodoWriteRoute(app, context);
  registerTodoReadRoute(app, context);
  registerTodoDescendantsRoute(app, context);
}
