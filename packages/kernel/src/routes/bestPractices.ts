import type { FastifyInstance } from "fastify";
import { buildBestPractices } from "./bestPractices/document.js";

/* Long-form composable-prose authoring guide returned at /best-practices.
   Linked from /guide. Audience: an LLM building a document via the
   composable-prose block-composition model. */

export function registerBestPracticesRoute(app: FastifyInstance): void {
  app.get("/best-practices", async (_req, reply) => {
    reply.type("text/markdown; charset=utf-8");
    return buildBestPractices();
  });
}
