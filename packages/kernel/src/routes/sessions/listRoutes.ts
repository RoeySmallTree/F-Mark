import type { FastifyInstance } from "fastify";
import { listSessions } from "../../sessions.js";
import { SessionEventsService, type SessionEventsQuery } from "./eventsService.js";
import { SessionPathResolver } from "./pathResolver.js";

interface ListQuery {
  scope?: string;
  path_id?: string;
  root?: string;
}

export function registerSessionListRoutes(
  app: FastifyInstance,
  pathResolver: SessionPathResolver,
  eventsService: SessionEventsService,
): void {
  app.get<{ Querystring: ListQuery }>("/sessions", async (req, reply) => {
    if (req.query.scope === "all") {
      return { sessions: await pathResolver.listSessionsAcrossPaths() };
    }

    if (!hasRootScope(req.query)) {
      return { sessions: await listSessions(pathResolver.resolveListPaths()) };
    }

    const scoped = await pathResolver.resolveScopedPaths(req.query);
    if (!scoped.ok) {
      reply.code(scoped.status);
      return scoped.body;
    }

    const sessions = await listSessions(scoped.paths);
    return {
      sessions: sessions.map((session) =>
        pathResolver.withPathMetadata(session, scoped.paths),
      ),
    };
  });

  app.get<{ Querystring: SessionEventsQuery }>(
    "/sessions/events",
    async (req, reply) => {
      const result = await eventsService.list(req.query);
      if (result.status !== undefined) reply.code(result.status);
      return result.body;
    },
  );
}

function hasRootScope(input: { path_id?: unknown; root?: unknown }): boolean {
  return (
    (typeof input.path_id === "string" && input.path_id.length > 0) ||
    (typeof input.root === "string" && input.root.length > 0)
  );
}
