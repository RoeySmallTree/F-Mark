import { open, realpath, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type { FastifyInstance, FastifyReply } from "fastify";
import { normaliseDeps, type PathDeps } from "./pathDeps.js";
import {
  projectRootGuard,
  resolveKnownRootScope,
  type KnownRoot,
} from "./rootScope.js";
import type { Paths } from "../paths.js";

const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;
const HARD_MAX_BYTES = 16 * 1024 * 1024;

/* Resolve a required root scope (path_id|root) + a root-relative rel_path to
   a canonical absolute file path that is guaranteed inside the known root.
   No active-root fallback and no absolute-path query (X4b). */
export async function resolveScopedFile(
  deps: PathDeps,
  query: { path_id?: string; root?: string; rel_path?: string },
  reply: FastifyReply,
): Promise<{ known: KnownRoot; canonical: string } | null> {
  const scope = await resolveKnownRootScope(deps, {
    path_id: query.path_id,
    root: query.root,
  });
  if (!scope.ok) {
    reply.code(scope.status).send(scope.body);
    return null;
  }
  const rel = query.rel_path;
  if (typeof rel !== "string" || rel.length === 0) {
    reply.code(400).send({
      code: "REL_PATH_REQUIRED",
      message: "rel_path query param is required",
    });
    return null;
  }
  if (isAbsolute(rel)) {
    reply.code(400).send({
      code: "REL_PATH_NOT_RELATIVE",
      message: "rel_path must be relative to the project root",
    });
    return null;
  }
  const root = scope.known.root;
  const target = join(root, rel);
  let canonical: string;
  try {
    canonical = await realpath(target);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? "EUNKNOWN";
    if (code === "ENOENT" || code === "ENOTDIR") {
      reply.code(404).send({ code: "PATH_NOT_FOUND", message: `path not found: ${rel}` });
      return null;
    }
    reply.code(400).send({
      code: "PATH_NOT_CANONICAL",
      message: `could not canonicalize: ${rel}`,
      details: { errno: code },
    });
    return null;
  }
  /* Guard against symlink/`..` escapes that land outside the known root. */
  const guard = projectRootGuard(root, canonical);
  if (!guard.ok) {
    reply.code(guard.status).send(guard.body);
    return null;
  }
  return { known: scope.known, canonical };
}

export function registerFilesTextRoute(
  app: FastifyInstance,
  depsArg: Paths | PathDeps,
): void {
  const deps = normaliseDeps(depsArg);

  app.get<{
    Querystring: {
      path_id?: string;
      root?: string;
      rel_path?: string;
      maxBytes?: string;
    };
  }>("/files/text", async (req, reply) => {
    const resolved = await resolveScopedFile(deps, req.query, reply);
    if (resolved === null) {
      return reply;
    }

    let info;
    try {
      info = await stat(resolved.canonical);
    } catch (err) {
      return reply.code(500).send({
        code: "STAT_FAILED",
        message: (err as Error).message,
      });
    }
    if (!info.isFile()) {
      return reply.code(400).send({
        code: "PATH_NOT_FILE",
        message: `path is not a regular file: ${resolved.canonical}`,
      });
    }

    let max = DEFAULT_MAX_BYTES;
    const raw = req.query.maxBytes;
    if (typeof raw === "string" && raw.length > 0) {
      const n = Number.parseInt(raw, 10);
      if (!Number.isNaN(n) && n > 0) max = Math.min(n, HARD_MAX_BYTES);
    }

    const readBytes = Math.min(info.size, max);
    const truncated = info.size > max;

    const fh = await open(resolved.canonical, "r");
    try {
      const buf = Buffer.alloc(readBytes);
      if (readBytes > 0) {
        await fh.read(buf, 0, readBytes, 0);
      }
      /* TextDecoder("utf-8") in non-fatal mode replaces invalid sequences
         with U+FFFD; that's the right behavior for "show me what's in
         this file" — we'd rather render garbled bytes than 500. */
      const content = new TextDecoder("utf-8").decode(buf);
      return {
        content,
        truncated,
        size: info.size,
        mtimeMs: info.mtimeMs,
      };
    } finally {
      await fh.close();
    }
  });

  app.put<{
    Body: {
      path_id?: string;
      root?: string;
      rel_path?: string;
      content?: string;
    };
  }>("/files/text", async (req, reply) => {
    const resolved = await resolveScopedFile(deps, req.body, reply);
    if (resolved === null) return reply;

    if (typeof req.body.content !== "string") {
      return reply.code(400).send({
        code: "CONTENT_REQUIRED",
        message: "content body field is required",
      });
    }

    let info;
    try {
      info = await stat(resolved.canonical);
    } catch (err) {
      return reply.code(500).send({
        code: "STAT_FAILED",
        message: (err as Error).message,
      });
    }
    if (!info.isFile()) {
      return reply.code(400).send({
        code: "PATH_NOT_FILE",
        message: `path is not a regular file: ${resolved.canonical}`,
      });
    }

    await writeFile(resolved.canonical, req.body.content, "utf8");
    const nextInfo = await stat(resolved.canonical);
    return {
      content: req.body.content,
      truncated: false,
      size: nextInfo.size,
      mtimeMs: nextInfo.mtimeMs,
    };
  });
}
