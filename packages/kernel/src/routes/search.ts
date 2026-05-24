import type { FastifyInstance } from "fastify";
import type {
  AnyEventRecord,
  ChoicesPayload,
  ProsePayload,
  SearchHit,
  TodoPayload,
} from "@f-mark/shared";
import type { Paths } from "../paths.js";
import { listSessions, sessionExists } from "../sessions.js";
import { readEvents } from "../events/reader.js";
import { normaliseDeps, resolvePaths, type PathDeps } from "./pathDeps.js";

const SNIPPET_RADIUS = 60; // ~120 char window

function buildSnippet(text: string, queryLower: string): string {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(queryLower);
  if (idx === -1) {
    // No direct match — return a truncated head as a fallback
    return text.length > SNIPPET_RADIUS * 2
      ? `${text.slice(0, SNIPPET_RADIUS * 2)}…`
      : text;
  }
  const start = Math.max(0, idx - SNIPPET_RADIUS);
  const end = Math.min(text.length, idx + queryLower.length + SNIPPET_RADIUS);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end)}${suffix}`;
}

function matchEvent(
  event: AnyEventRecord,
  queryLower: string,
): string | null {
  if (event.kind === "prose") {
    const payload = event.payload as ProsePayload;
    if (
      typeof payload.name === "string" &&
      payload.name.toLowerCase().includes(queryLower)
    ) {
      return buildSnippet(payload.name, queryLower);
    }
    if (
      typeof payload.content === "string" &&
      payload.content.toLowerCase().includes(queryLower)
    ) {
      return buildSnippet(payload.content, queryLower);
    }
    return null;
  }
  if (event.kind === "choices") {
    const payload = event.payload as ChoicesPayload;
    if (
      typeof payload.question === "string" &&
      payload.question.toLowerCase().includes(queryLower)
    ) {
      return buildSnippet(payload.question, queryLower);
    }
    if (Array.isArray(payload.options)) {
      for (const opt of payload.options) {
        if (
          typeof opt.label === "string" &&
          opt.label.toLowerCase().includes(queryLower)
        ) {
          return buildSnippet(opt.label, queryLower);
        }
      }
    }
    return null;
  }
  if (event.kind === "todo") {
    const payload = event.payload as TodoPayload;
    if (
      typeof payload.title === "string" &&
      payload.title.toLowerCase().includes(queryLower)
    ) {
      return buildSnippet(payload.title, queryLower);
    }
    if (
      typeof payload.body === "string" &&
      payload.body.toLowerCase().includes(queryLower)
    ) {
      return buildSnippet(payload.body, queryLower);
    }
    return null;
  }
  return null;
}

export function registerSearchRoutes(
  app: FastifyInstance,
  pOrDeps: Paths | PathDeps,
): void {
  const deps = normaliseDeps(pOrDeps);

  app.get<{ Querystring: { q?: string; session?: string; limit?: string } }>(
    "/search",
    async (req, reply) => {
      const p = resolvePaths(deps);
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      if (q.length === 0) {
        return { hits: [] };
      }
      const queryLower = q.toLowerCase();
      let limit = 50;
      if (typeof req.query.limit === "string" && req.query.limit.length > 0) {
        const parsed = Number.parseInt(req.query.limit, 10);
        if (!Number.isNaN(parsed) && parsed > 0) {
          limit = Math.min(parsed, 200);
        }
      }

      const sessionFilter = req.query.session;
      let sessionIds: string[];
      if (typeof sessionFilter === "string" && sessionFilter.length > 0) {
        if (!(await sessionExists(p, sessionFilter))) {
          reply.code(404);
          return { error: `session not found: ${sessionFilter}` };
        }
        sessionIds = [sessionFilter];
      } else {
        const all = await listSessions(p);
        sessionIds = all.map((s) => s.id);
      }

      const hits: SearchHit[] = [];
      for (const sid of sessionIds) {
        const events = await readEvents(p, sid, {
          kinds: ["prose", "choices", "todo"],
        });
        for (const event of events) {
          const snippet = matchEvent(event, queryLower);
          if (snippet === null) continue;
          hits.push({ session_id: sid, event, snippet });
        }
      }

      hits.sort((a, b) => b.event.timestamp.localeCompare(a.event.timestamp));
      return { hits: hits.slice(0, limit) };
    },
  );
}
