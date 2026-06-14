import type { FastifyInstance, FastifyReply } from "fastify";
import type { PostFlowBody } from "@f-mark/shared";
import type { Paths } from "../paths.js";
import { sessionExists } from "../sessions.js";
import type { Bus } from "../ws/bus.js";
import { normaliseDeps, resolvePaths, type PathDeps } from "./pathDeps.js";
import { writeFlowEvent } from "../services/events.js";
import { publishEventWrites } from "../services/eventPublisher.js";

async function ensureSession(
  p: Paths,
  sessionId: string,
  reply: FastifyReply,
): Promise<boolean> {
  if (!(await sessionExists(p, sessionId))) {
    reply.code(404).send({ error: `session not found: ${sessionId}` });
    return false;
  }
  return true;
}

export function registerFlowRoutes(
  app: FastifyInstance,
  pOrDeps: Paths | PathDeps,
  getBus: () => Bus,
): void {
  const deps = normaliseDeps(pOrDeps);

  app.post<{ Params: { id: string }; Body: PostFlowBody }>(
    "/sessions/:id/events/flow",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        body: {
          type: "object",
          required: ["participant_id", "id", "nodes", "edges"],
          additionalProperties: false,
          properties: {
            participant_id: { type: "string", minLength: 1 },
            id: { type: "string", minLength: 1 },
            title: { type: "string" },
            supersedes: { type: "string" },
            append_to: { type: "string", minLength: 1 },
            nodes: {
              type: "array",
              items: {
                type: "object",
                required: ["id", "label"],
                properties: {
                  id: { type: "string", minLength: 1 },
                  label: { type: "string" },
                  title: { type: "string" },
                  content: { type: "string" },
                  popover: {
                    type: "object",
                    required: ["html"],
                    properties: {
                      html: { type: "string" },
                      css: { type: "string" },
                      js: { type: "string" },
                    },
                  },
                  itemType: {
                    type: "string",
                    enum: ["default", "info", "success", "danger", "disabled"],
                  },
                  // `enum: [true, false]` matches the same strict-boolean trick
                  // used in routes/events.ts for prose `arbitrary` — avoids
                  // Fastify/AJV's default-coercion behavior.
                  focused: { enum: [true, false] },
                  position: {
                    type: "object",
                    required: ["x", "y"],
                    properties: {
                      x: { type: "number" },
                      y: { type: "number" },
                    },
                  },
                },
              },
            },
            edges: {
              type: "array",
              items: {
                type: "object",
                required: ["id", "source", "target"],
                properties: {
                  id: { type: "string", minLength: 1 },
                  source: { type: "string", minLength: 1 },
                  target: { type: "string", minLength: 1 },
                  label: { type: "string" },
                  style: {
                    type: "string",
                    enum: ["solid", "dashed", "dotted", "flowing"],
                  },
                  type: {
                    type: "string",
                    enum: ["default", "info", "success", "danger"],
                  },
                },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const p = resolvePaths(deps);
      if (!(await ensureSession(p, req.params.id, reply))) return;
      try {
        const written = await writeFlowEvent(p, req.params.id, req.body);
        publishEventWrites(getBus(), req.params.id, written.publish);
        return written.response;
      } catch (err) {
        reply.code(400);
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  );
}
