import type { FastifyInstance } from "fastify";
import { updateState } from "../../state/store.js";
import type { PathRouteContext } from "./routeContext.js";

export function registerPathReadRoute(
  app: FastifyInstance,
  context: PathRouteContext,
): void {
  app.get("/paths", async () => {
    const state = await updateState(context.global(), (s) => s);
    context.mirrorRevision(state);
    return context.response(state);
  });
}
