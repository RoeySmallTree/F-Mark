import type { FastifyInstance } from "fastify";
import { registerProjectPath } from "../../paths/registry.js";
import { mruPush, updateState } from "../../state/store.js";
import type { PathRouteContext } from "./routeContext.js";

export function registerKnownPathRoutes(
  app: FastifyInstance,
  context: PathRouteContext,
): void {
  app.post<{ Body: { path?: string } }>("/paths/known", async (req, reply) => {
    const canonical = await context.canonicalBodyPathOrSend(
      req.body?.path,
      reply,
    );
    if (canonical === null) return reply;
    const globalPaths = context.global();
    const next = await updateState(globalPaths, (state) =>
      mruPush(state, canonical),
    );
    await registerProjectPath(globalPaths, canonical);
    return context.responseAndBroadcast(next);
  });

  app.delete<{ Querystring: { path?: string } }>(
    "/paths/known",
    async (req, reply) => {
      const target = context.queryPathOrSend(req.query.path, reply);
      if (target === null) return reply;
      const next = await updateState(context.global(), (state) => ({
        ...state,
        knownPaths: state.knownPaths.filter((path) => path !== target),
      }));
      await context.responseAndBroadcast(next);
      return { knownPaths: next.knownPaths };
    },
  );
}
