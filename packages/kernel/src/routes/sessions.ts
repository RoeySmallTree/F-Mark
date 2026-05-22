import type { FastifyInstance } from "fastify";
import type { Paths } from "../paths.js";
import { createSession, listSessions } from "../sessions.js";

interface CreateBody {
  slug?: string;
}

export function registerSessionRoutes(app: FastifyInstance, p: Paths): void {
  app.get("/sessions", async () => {
    return { sessions: await listSessions(p) };
  });

  app.post<{ Body: CreateBody }>(
    "/sessions",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            slug: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      try {
        return await createSession(p, { slug: req.body?.slug });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.code(400);
        return { error: message };
      }
    },
  );
}
