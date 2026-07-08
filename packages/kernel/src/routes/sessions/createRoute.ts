import type { FastifyInstance } from "fastify";
import type { CreateSessionRequest } from "@f-mark/shared";
import { ensureDefaultUserParticipant } from "../../participants.js";
import { createSession } from "../../sessions.js";
import { resolveCreateSessionPaths } from "./createPaths.js";
import { errorMessage } from "./errors.js";
import { SessionPathResolver } from "./pathResolver.js";
import { initSessionProject } from "./projectInit.js";
import type { SessionRouteDeps } from "./types.js";

export function registerSessionCreateRoute(
  app: FastifyInstance,
  deps: SessionRouteDeps,
  pathResolver: SessionPathResolver,
): void {
  app.post<{ Body: CreateSessionRequest }>(
    "/sessions",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            slug: { type: "string" },
            path: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      const body = req.body ?? {};
      const resolved = await resolveCreateSessionPaths(body, pathResolver);
      if (!resolved.ok) {
        reply.code(resolved.status);
        return resolved.body;
      }

      try {
        await initSessionProject(deps, resolved.paths);
        await ensureDefaultUserParticipant(resolved.paths);
        const session = await createSession(resolved.paths, { slug: body.slug });
        await pathResolver.registerRoot(resolved.paths.root());
        return pathResolver.withPathMetadata(session, resolved.paths);
      } catch (err) {
        reply.code(400);
        return { error: errorMessage(err) };
      }
    },
  );
}
