import type { FastifyInstance } from "fastify";
import type { Paths } from "../paths.js";
import { normaliseDeps, resolvePaths, type PathDeps } from "./pathDeps.js";
import { SearchHitCollector } from "./search/searchResults.js";
import { SearchTargetResolver } from "./search/searchTargets.js";

function parseLimit(raw: string | undefined): number {
  if (typeof raw !== "string" || raw.length === 0) return 50;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return 50;
  return Math.min(parsed, 200);
}

export function registerSearchRoutes(
  app: FastifyInstance,
  pOrDeps: Paths | PathDeps,
): void {
  const deps = normaliseDeps(pOrDeps);

  app.get<{
    Querystring: {
      q?: string;
      session?: string;
      limit?: string;
      scope?: string;
    };
  }>(
    "/search",
    async (req, reply) => {
      const p = resolvePaths(deps);
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      if (q.length === 0) {
        return { hits: [] };
      }
      const queryLower = q.toLowerCase();
      const limit = parseLimit(req.query.limit);
      const targets = await new SearchTargetResolver(deps).resolve(p, req.query);
      if ("error" in targets) {
        reply.code(targets.status);
        return { error: targets.error };
      }
      const hits = await new SearchHitCollector(queryLower).collect(targets, limit);
      return { hits };
    },
  );
}
