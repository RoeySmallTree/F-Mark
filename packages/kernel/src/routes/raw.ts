import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { Paths } from "../paths.js";
import { sessionExists } from "../sessions.js";
import { normaliseDeps, resolvePaths, type PathDeps } from "./pathDeps.js";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".ppt": "application/vnd.ms-powerpoint",
  ".wasm": "application/wasm",
};

function mimeFor(filename: string): string {
  const ext = extname(filename).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
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
  reply.type(mimeFor(filepath));
  reply.header("content-length", String(stats.size));
  return reply.send(createReadStream(filepath));
}

export function registerRawRoutes(
  app: FastifyInstance,
  pOrDeps: Paths | PathDeps,
): void {
  const deps = normaliseDeps(pOrDeps);

  app.get<{ Params: { id: string; filename: string } }>(
    "/sessions/:id/raw/:filename",
    async (req, reply) => {
      const p = resolvePaths(deps);
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

  app.get<{ Params: { id: string; filename: string; "*": string } }>(
    "/sessions/:id/raw/:filename/*",
    async (req, reply) => {
      const p = resolvePaths(deps);
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
      return serveFile(reply, target);
    },
  );
}
