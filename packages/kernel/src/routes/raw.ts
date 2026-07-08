import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { Paths } from "../paths.js";
import { sessionExists } from "../sessions.js";
import { normaliseDeps, resolvePaths, type PathDeps } from "./pathDeps.js";
import { resolveKnownRootScope } from "./rootScope.js";
import { assembleHtmlBundleIndex } from "../events/htmlBundle.js";
import {
  isActiveContentMime,
  mimeForExtension,
} from "../lib/mimeTable.js";

const RAW_ACTIVE_CONTENT_CSP = "sandbox allow-scripts";

function applyRawContentHeaders(reply: FastifyReply, mime: string): void {
  reply.type(mime);
  reply.header("X-Content-Type-Options", "nosniff");
  if (isActiveContentMime(mime)) {
    /* Raw html-event bundles are intentionally interactive previews, but they
       must not inherit the app origin when opened directly or iframeed. */
    reply.header("Content-Security-Policy", RAW_ACTIVE_CONTENT_CSP);
  }
}

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

function resolveSafe(
  p: Paths,
  sessionId: string,
  filename: string,
  rest: string,
): string | null {
  const sessionRoot = resolve(p.sessionDir(sessionId));
  // Reject obvious traversal inputs first
  if (filename.includes("..") || filename.includes("\0")) return null;
  if (rest.includes("..") || rest.includes("\0")) return null;
  const candidate = rest.length > 0
    ? join(sessionRoot, filename, rest)
    : join(sessionRoot, filename);
  const resolved = resolve(candidate);
  if (
    resolved !== sessionRoot &&
    !resolved.startsWith(`${sessionRoot}${sep}`)
  ) {
    return null;
  }
  return resolved;
}

async function serveFile(
  reply: FastifyReply,
  filepath: string,
): Promise<FastifyReply> {
  let stats;
  try {
    stats = await stat(filepath);
  } catch {
    reply.code(404);
    return reply.send({ error: "not found" });
  }
  if (!stats.isFile()) {
    reply.code(404);
    return reply.send({ error: "not found" });
  }
  applyRawContentHeaders(reply, mimeForExtension(filepath));
  reply.header("content-length", String(stats.size));
  return reply.send(createReadStream(filepath));
}

async function isFile(filepath: string): Promise<boolean> {
  try {
    return (await stat(filepath)).isFile();
  } catch {
    return false;
  }
}

async function readOptionalText(filepath: string): Promise<string | undefined> {
  try {
    return await readFile(filepath, "utf8");
  } catch {
    return undefined;
  }
}

async function serveHtmlBundleIndex(
  reply: FastifyReply,
  filepath: string,
): Promise<FastifyReply> {
  let html;
  try {
    html = await readFile(filepath, "utf8");
  } catch {
    reply.code(404);
    return reply.send({ error: "not found" });
  }
  const folder = dirname(filepath);
  const assembled = assembleHtmlBundleIndex(html, {
    css: await readOptionalText(join(folder, "style.css")),
    js: await readOptionalText(join(folder, "script.js")),
  });
  applyRawContentHeaders(reply, "text/html; charset=utf-8");
  reply.header("content-length", String(Buffer.byteLength(assembled)));
  return reply.send(assembled);
}

function shouldAssembleHtmlBundleIndex(filename: string, rest: string): boolean {
  return filename.endsWith(".html") && rest === "index.html";
}

export function registerRawRoutes(
  app: FastifyInstance,
  pOrDeps: Paths | PathDeps,
): void {
  const deps = normaliseDeps(pOrDeps);

  async function resolveRawPaths(
    query: { path_id?: unknown; root?: unknown },
    reply: FastifyReply,
  ): Promise<Paths | null> {
    const hasScope =
      (typeof query.path_id === "string" && query.path_id.length > 0) ||
      (typeof query.root === "string" && query.root.length > 0);
    if (!hasScope) return resolvePaths(deps);
    const scope = await resolveKnownRootScope(deps, {
      path_id: query.path_id,
      root: query.root,
    });
    if (!scope.ok) {
      reply.code(scope.status).send(scope.body);
      return null;
    }
    return scope.known.paths;
  }

  app.get<{
    Params: { id: string; filename: string };
    Querystring: { path_id?: string; root?: string };
  }>(
    "/sessions/:id/raw/:filename",
    async (req, reply) => {
      const p = await resolveRawPaths(req.query, reply);
      if (p === null) return reply;
      if (!(await ensureSession(p, req.params.id, reply))) return reply;
      const target = resolveSafe(
        p,
        req.params.id,
        req.params.filename,
        "",
      );
      if (target === null) {
        reply.code(400);
        return reply.send({ error: "invalid path" });
      }
      return serveFile(reply, target);
    },
  );

  app.get<{
    Params: { id: string; filename: string; "*": string };
    Querystring: { path_id?: string; root?: string };
  }>(
    "/sessions/:id/raw/:filename/*",
    async (req, reply) => {
      const p = await resolveRawPaths(req.query, reply);
      if (p === null) return reply;
      if (!(await ensureSession(p, req.params.id, reply))) return reply;
      const rest = req.params["*"];
      const target = resolveSafe(
        p,
        req.params.id,
        req.params.filename,
        rest,
      );
      if (target === null) {
        reply.code(400);
        return reply.send({ error: "invalid path" });
      }
      if (shouldAssembleHtmlBundleIndex(req.params.filename, rest)) {
        return serveHtmlBundleIndex(reply, target);
      }
      return serveFile(reply, target);
    },
  );
}
