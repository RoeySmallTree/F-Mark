import type { FastifyInstance } from "fastify";
import { registerProjectPath } from "../../paths/registry.js";
import { bumpRevision, mruPush, updateState } from "../../state/store.js";
import type { PathRouteContext } from "./routeContext.js";

export function registerActivePathRoutes(
  app: FastifyInstance,
  context: PathRouteContext,
): void {
  app.post<{ Body: { path?: string } }>("/paths/active", async (req, reply) => {
    const canonical = await context.canonicalBodyPathOrSend(
      req.body?.path,
      reply,
    );
    if (canonical === null) return reply;
    const globalPaths = context.global();
    const next = await updateState(globalPaths, (state) =>
      bumpRevision(mruPush({ ...state, activePath: canonical }, canonical)),
    );
    await registerProjectPath(globalPaths, canonical);
    await context.activateCanonicalPath(canonical, next);
    return context.responseAndBroadcast(next);
  });

  app.delete("/paths/active", async () => {
    const next = await updateState(context.global(), (state) =>
      bumpRevision({ ...state, activePath: null }),
    );
    context.clearActivePath(next);
    return context.responseAndBroadcast(next);
  });
}
