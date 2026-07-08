import type { FastifyInstance } from "fastify";
import { deleteSession, renameSession, type SessionMeta } from "../../sessions.js";
import type { Bus } from "../../ws/bus.js";
import { errorMessage, routeStatusForSessionError } from "./errors.js";
import { SessionPathResolver } from "./pathResolver.js";
import type { SessionRouteDeps, UpdateSessionRouteBody } from "./types.js";

interface PathQuery {
  path?: string;
  path_id?: string;
  root?: string;
}

export function registerSessionMutationRoutes(
  app: FastifyInstance,
  pathResolver: SessionPathResolver,
  deps: SessionRouteDeps,
  getBus?: () => Bus,
): void {
  app.patch<{
    Params: { id: string };
    Body: UpdateSessionRouteBody;
  }>(
    "/sessions/:id",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", minLength: 1 } },
        },
        body: {
          type: "object",
          required: ["slug"],
          additionalProperties: false,
          properties: {
            slug: { type: "string", minLength: 1 },
            path: { type: "string" },
            path_id: { type: "string" },
            root: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      const scoped = await pathResolver.resolveScopedPaths(req.body);
      if (!scoped.ok) {
        reply.code(scoped.status);
        return scoped.body;
      }

      const oldId = decodeURIComponent(req.params.id);
      let session: SessionMeta;
      try {
        session = await renameSession(scoped.paths, oldId, {
          slug: req.body.slug,
        });
      } catch (err) {
        const message = errorMessage(err);
        reply.code(routeStatusForSessionError(message));
        return { error: message };
      }

      /* The session id is immutable — a rename only updates the display slug
         in the session meta, so there is nothing to rebind and no client can
         be stranded on a stale id. The broadcast just refreshes labels. */
      const withPath = pathResolver.withPathMetadata(session, scoped.paths);
      getBus?.().publish({
        type: "session.renamed",
        session: withPath,
      });
      return withPath;
    },
  );

  app.delete<{
    Params: { id: string };
    Querystring: PathQuery;
  }>("/sessions/:id", async (req, reply) => {
    const scoped = await pathResolver.resolveScopedPaths(req.query);
    if (!scoped.ok) {
      reply.code(scoped.status);
      return scoped.body;
    }

    try {
      await deleteSession(scoped.paths, decodeURIComponent(req.params.id));
      reply.code(204);
      return;
    } catch (err) {
      const message = errorMessage(err);
      reply.code(routeStatusForSessionError(message));
      return { error: message };
    }
  });
}
