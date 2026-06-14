import { open, stat } from "node:fs/promises";
import { normalize as normPath, sep } from "node:path";
import type { FastifyInstance } from "fastify";
import { resolveBrowsePath } from "./fs.js";
import {
  normaliseDeps,
  resolvePaths,
  type PathDeps,
} from "./pathDeps.js";
import type { Paths } from "../paths.js";

const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;
const HARD_MAX_BYTES = 16 * 1024 * 1024;

function projectRootGuard(
  paths: Paths,
  canonical: string,
): { ok: true } | { ok: false; status: number; body: { code: string; message: string } } {
  const root = normPath(paths.root());
  const rootWithSep = root.endsWith(sep) ? root : root + sep;
  if (canonical !== root && !canonical.startsWith(rootWithSep)) {
    return {
      ok: false,
      status: 403,
      body: {
        code: "PATH_OUTSIDE_PROJECT",
        message: "path must live inside the active project",
      },
    };
  }
  return { ok: true };
}

export function registerFilesTextRoute(
  app: FastifyInstance,
  depsArg: Paths | PathDeps,
): void {
  const deps = normaliseDeps(depsArg);

  app.get<{ Querystring: { path?: string; maxBytes?: string } }>(
    "/files/text",
    async (req, reply) => {
      const resolved = await resolveBrowsePath(req.query.path);
      if (!resolved.ok) return reply.code(resolved.status).send(resolved.body);

      const paths = resolvePaths(deps);
      const guard = projectRootGuard(paths, resolved.canonical);
      if (!guard.ok) return reply.code(guard.status).send(guard.body);

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
    },
  );
}
