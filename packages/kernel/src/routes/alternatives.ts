import type { FastifyInstance } from "fastify";
import type { PostAlternativesBody } from "@f-mark/shared";
import type { Paths } from "../paths.js";
import type { Bus } from "../ws/bus.js";
import { normaliseDeps, type PathDeps } from "./pathDeps.js";
import type { RootScope } from "./rootScope.js";
import { writeAlternativesEvent } from "../services/events.js";
import { createScopedWriteRunner } from "./events/scopedWrite.js";

/* Required root scope (expansion-decisions.md X2) — every event write carries
   a `path_id` or `root`, resolved through known roots. No active-root fallback. */
const ROOT_SCOPE_PROPS = {
  path_id: { type: "string" },
  root: { type: "string" },
} as const;

type AlternativesBody = PostAlternativesBody & RootScope;

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
  const runScopedWrite = createScopedWriteRunner(deps, getBus);

  app.post<{ Params: { id: string }; Body: AlternativesBody }>(
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
            ...ROOT_SCOPE_PROPS,
          },
        },
      },
    },
    async (req, reply) => {
      return runScopedWrite(req.body, req.params.id, reply, (p) =>
        writeAlternativesEvent(p, req.params.id, req.body),
      );
    },
  );
}
