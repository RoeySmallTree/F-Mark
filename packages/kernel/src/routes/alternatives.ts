import type { FastifyInstance, FastifyReply } from "fastify";
import type { PostAlternativesBody } from "@f-mark/shared";
import type { Paths } from "../paths.js";
import { sessionExists } from "../sessions.js";
import type { Bus } from "../ws/bus.js";
import { normaliseDeps, resolvePaths, type PathDeps } from "./pathDeps.js";
import { writeAlternativesEvent } from "../services/events.js";
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

/* POST /sessions/:id/events/alternatives — atomic visual-alternatives write.
   Writes one html bundle per option, then a single `choices` event whose
   options reference the generated bundle filenames. Convenience writer over
   the existing html + choices event kinds; no new EventKind. */
export function registerAlternativesRoutes(
  app: FastifyInstance,
  pOrDeps: Paths | PathDeps,
  getBus: () => Bus,
): void {
  const deps = normaliseDeps(pOrDeps);

  app.post<{ Params: { id: string }; Body: PostAlternativesBody }>(
    "/sessions/:id/events/alternatives",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        body: {
          type: "object",
          required: ["participant_id", "id", "question", "options", "multi"],
          additionalProperties: false,
          properties: {
            participant_id: { type: "string", minLength: 1 },
            id: { type: "string" },
            question: { type: "string" },
            options: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                required: ["id", "label", "html"],
                additionalProperties: false,
                properties: {
                  id: { type: "string", minLength: 1 },
                  label: { type: "string", minLength: 1 },
                  html: { type: "string", minLength: 1 },
                  css: { type: "string" },
                  js: { type: "string" },
                  title: { type: "string" },
                  dependencies: { type: "array", items: { type: "string" } },
                },
              },
            },
            multi: { type: "boolean" },
            supersedes: { type: "string" },
            append_to: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (req, reply) => {
      const p = resolvePaths(deps);
      if (!(await ensureSession(p, req.params.id, reply))) return;
      try {
        const written = await writeAlternativesEvent(p, req.params.id, req.body);
        publishEventWrites(getBus(), req.params.id, written.publish);
        return written.response;
      } catch (err) {
        reply.code(400);
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  );
}
