import type { FastifyInstance } from "fastify";
import type { PostHtmlBody } from "@f-mark/shared";
import type { Paths } from "../paths.js";
import type { Bus } from "../ws/bus.js";
import { normaliseDeps, type PathDeps } from "./pathDeps.js";
import { writeHtmlEvent } from "../services/events.js";
import { createScopedWriteRunner } from "./events/scopedWrite.js";

export function registerHtmlRoutes(
  app: FastifyInstance,
  pOrDeps: Paths | PathDeps,
  getBus: () => Bus,
): void {
  const deps = normaliseDeps(pOrDeps);
  const runScopedWrite = createScopedWriteRunner(deps, getBus);

  app.post<{
    Params: { id: string };
    Body: PostHtmlBody & { path_id?: string; root?: string };
  }>(
    "/sessions/:id/events/html",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        body: {
          type: "object",
          required: ["participant_id", "html"],
          additionalProperties: false,
          properties: {
            participant_id: { type: "string", minLength: 1 },
            html: { type: "string" },
            css: { type: "string" },
            js: { type: "string" },
            title: { type: "string" },
            dependencies: {
              type: "array",
              items: { type: "string" },
            },
            supersedes: { type: "string" },
            append_to: { type: "string", minLength: 1 },
            /* Required root scope (X2). */
            path_id: { type: "string" },
            root: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      return runScopedWrite(req.body, req.params.id, reply, (p) =>
        writeHtmlEvent(p, req.params.id, req.body),
      );
    },
  );
}
