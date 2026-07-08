import type { FastifyInstance } from "fastify";
import type { PostFlowBody } from "@f-mark/shared";
import type { Paths } from "../paths.js";
import type { Bus } from "../ws/bus.js";
import { normaliseDeps, type PathDeps } from "./pathDeps.js";
import { writeFlowEvent } from "../services/events.js";
import { createScopedWriteRunner } from "./events/scopedWrite.js";

export function registerFlowRoutes(
  app: FastifyInstance,
  pOrDeps: Paths | PathDeps,
  getBus: () => Bus,
): void {
  const deps = normaliseDeps(pOrDeps);
  const runScopedWrite = createScopedWriteRunner(deps, getBus);

  app.post<{
    Params: { id: string };
    Body: PostFlowBody & { path_id?: string; root?: string };
  }>(
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
            /* Required root scope (X2). */
            path_id: { type: "string" },
            root: { type: "string" },
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
      return runScopedWrite(req.body, req.params.id, reply, (p) =>
        writeFlowEvent(p, req.params.id, req.body),
      );
    },
  );
}
