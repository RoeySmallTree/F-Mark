import type { FastifyInstance } from "fastify";
import type { Paths } from "../paths.js";
import {
  listParticipants,
  registerAgent,
  updateParticipant,
} from "../participants.js";

interface RegisterBody {
  kind: "agent";
  name?: string;
  suggested_id?: string;
}

interface UpdateParams {
  id: string;
}

interface UpdateBody {
  name?: string;
  color?: string;
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
            name: { type: "string", minLength: 1, maxLength: 60 },
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

  app.patch<{ Params: UpdateParams; Body: UpdateBody }>(
    "/participants/:id",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", minLength: 1 } },
        },
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string", minLength: 1, maxLength: 60 },
            color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
          },
        },
      },
    },
    async (req, reply) => {
      try {
        const updated = await updateParticipant(p, req.params.id, {
          name: req.body.name,
          color: req.body.color,
        });
        return updated;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const status = /not found/i.test(message) ? 404 : 400;
        reply.code(status);
        return { error: message };
      }
    },
  );
}
