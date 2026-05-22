import type { FastifyInstance } from "fastify";
import type { Paths } from "../paths.js";
import { listParticipants, registerAgent } from "../participants.js";

interface RegisterBody {
  kind: "agent";
  name?: string;
  suggested_id?: string;
}

export function registerParticipantRoutes(app: FastifyInstance, p: Paths): void {
  app.get("/participants", async () => {
    return { participants: await listParticipants(p) };
  });

  app.post<{ Body: RegisterBody }>(
    "/participants/register",
    {
      schema: {
        body: {
          type: "object",
          required: ["kind", "name"],
          properties: {
            kind: { type: "string", enum: ["agent"] },
            name: { type: "string", minLength: 1 },
            suggested_id: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      try {
        const created = await registerAgent(p, {
          name: req.body.name!,
          suggested_id: req.body.suggested_id,
        });
        return created;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.code(400);
        return { error: message };
      }
    },
  );
}
