import type { FastifyInstance } from "fastify";
import type {
  AnyEventRecord,
  ChoicesPayload,
  FileRefPayload,
  FlowPayload,
  HtmlManifest,
  ProsePayload,
  SearchHit,
  SubagentOutputPayload,
  SubagentRunPayload,
  TodoPayload,
  ToolUsePayload,
} from "@f-mark/shared";
import { paths as makePaths, type Paths } from "../paths.js";
import { computePathId } from "../paths/identity.js";
import { listRegisteredProjectPaths } from "../paths/registry.js";
import { readState } from "../state/store.js";
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
  if (event.kind === "file") {
    const payload = event.payload as FileRefPayload;
    const text = [
      payload.display_name,
      payload.path,
      payload.mime_type,
      payload.description,
    ]
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .join(" ");
    return text.toLowerCase().includes(queryLower)
      ? buildSnippet(text, queryLower)
      : null;
  }
  if (event.kind === "html") {
    const payload = event.payload as HtmlManifest;
    const text = [payload.title, payload.id, ...(payload.dependencies ?? [])]
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .join(" ");
    return text.toLowerCase().includes(queryLower)
      ? buildSnippet(text, queryLower)
      : null;
  }
  if (event.kind === "flow") {
    const payload = event.payload as FlowPayload;
    const nodeText = payload.nodes
      .map((node) => [node.label, node.title, node.content].join(" "))
      .join(" ");
    const edgeText = payload.edges.map((edge) => edge.label ?? "").join(" ");
    const text = [payload.title, payload.id, nodeText, edgeText].join(" ");
    return text.toLowerCase().includes(queryLower)
      ? buildSnippet(text, queryLower)
      : null;
  }
  if (event.kind === "tool-use") {
    const payload = event.payload as ToolUsePayload;
    const text = [
      payload.tool_name,
      payload.tool_use_id,
      JSON.stringify(payload.input),
      JSON.stringify(payload.result),
    ].join(" ");
    return text.toLowerCase().includes(queryLower)
      ? buildSnippet(text, queryLower)
      : null;
  }
  if (event.kind === "subagent-run") {
    const payload = event.payload as SubagentRunPayload;
    const text = [
      payload.name,
      payload.role,
      payload.prompt_preview,
      payload.status,
      payload.subagent_id,
      payload.correlation_id,
      payload.source,
    ].join(" ");
    return text.toLowerCase().includes(queryLower)
      ? buildSnippet(text, queryLower)
      : null;
  }
  if (event.kind === "subagent-output") {
    const payload = event.payload as SubagentOutputPayload;
    const text = [
      payload.name,
      payload.content,
      payload.status,
      payload.subagent_id,
      payload.correlation_id,
      payload.source,
    ].join(" ");
    return text.toLowerCase().includes(queryLower)
      ? buildSnippet(text, queryLower)
      : null;
  }
  const fallback = JSON.stringify(event.payload);
  if (fallback.toLowerCase().includes(queryLower)) {
    return buildSnippet(fallback, queryLower);
  }
  return null;
}

function pushUnique(out: string[], seen: Set<string>, path: string | null): void {
  if (path === null || seen.has(path)) return;
  seen.add(path);
  out.push(path);
}

async function listSearchRoots(deps: PathDeps): Promise<string[]> {
  const roots: string[] = [];
  const seen = new Set<string>();
  if (deps.ref) {
    const ctx = deps.ref.get();
    const state = await readState(deps.ref.global());
    pushUnique(roots, seen, ctx.active?.root() ?? null);
    pushUnique(roots, seen, state.activePath);
    for (const path of state.knownPaths) pushUnique(roots, seen, path);
    for (const favorite of state.favorites) {
      pushUnique(roots, seen, favorite.path);
    }
    for (const path of await listRegisteredProjectPaths(deps.ref.global())) {
      pushUnique(roots, seen, path);
    }
  }
  pushUnique(roots, seen, deps.fallback.root());
  return roots;
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
      let limit = 50;
      if (typeof req.query.limit === "string" && req.query.limit.length > 0) {
        const parsed = Number.parseInt(req.query.limit, 10);
        if (!Number.isNaN(parsed) && parsed > 0) {
          limit = Math.min(parsed, 200);
        }
      }

      const sessionFilter = req.query.session;
      let searchTargets: Array<{
        p: Paths;
        sessionId: string;
        sessionSlug?: string;
        path?: string;
        pathId?: string;
      }>;
      if (typeof sessionFilter === "string" && sessionFilter.length > 0) {
        if (!(await sessionExists(p, sessionFilter))) {
          reply.code(404);
          return { error: `session not found: ${sessionFilter}` };
        }
        searchTargets = [{ p, sessionId: sessionFilter }];
      } else if (req.query.scope === "all") {
        searchTargets = [];
        for (const root of await listSearchRoots(deps)) {
          const rootPaths = makePaths(root);
          let sessions;
          try {
            sessions = await listSessions(rootPaths);
          } catch {
            continue;
          }
          let pathId: string;
          try {
            pathId = computePathId(root);
          } catch {
            continue;
          }
          for (const session of sessions) {
            searchTargets.push({
              p: rootPaths,
              sessionId: session.id,
              sessionSlug: session.slug,
              path: root,
              pathId,
            });
          }
        }
      } else {
        const all = await listSessions(p);
        searchTargets = all.map((s) => ({
          p,
          sessionId: s.id,
          sessionSlug: s.slug,
        }));
      }

      const hits: SearchHit[] = [];
      for (const target of searchTargets) {
        const events = await readEvents(target.p, target.sessionId, {});
        for (const event of events) {
          const snippet = matchEvent(event, queryLower);
          if (snippet === null) continue;
          hits.push({
            session_id: target.sessionId,
            session_slug: target.sessionSlug,
            path: target.path,
            path_id: target.pathId,
            event,
            snippet,
          });
        }
      }

      hits.sort((a, b) => b.event.timestamp.localeCompare(a.event.timestamp));
      return { hits: hits.slice(0, limit) };
    },
  );
}
