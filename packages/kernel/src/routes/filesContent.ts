import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import {
  isActiveContentMime,
  mimeForExtension,
} from "../lib/mimeTable.js";
import { normaliseDeps, type PathDeps } from "./pathDeps.js";
import { resolveScopedFile } from "./filesText.js";
import type { Paths } from "../paths.js";

/* Cap for full-file reads (no Range header). Larger files must request a
   Range slice — this keeps a misbehaving client from holding 1 GB of file
   in memory mid-stream and starving other connections. */
const MAX_FULL_BYTES = 100 * 1024 * 1024;

interface RangeSpec {
  start: number;
  end: number;
}

/* Parse a single `bytes=START-END` Range header. Returns `null` for any
   unsupported form (multi-range, unit ≠ bytes, missing end on a suffix
   request, etc.) — the caller falls back to a 200 full-body response. */
function parseRange(raw: string | undefined, size: number): RangeSpec | null | "invalid" {
  if (raw === undefined || raw === null) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(raw.trim());
  if (m === null) return "invalid";
  const startStr = m[1] ?? "";
  const endStr = m[2] ?? "";
  let start: number;
  let end: number;
  if (startStr.length === 0) {
    /* suffix range: bytes=-N → last N bytes */
    if (endStr.length === 0) return "invalid";
    const suffix = Number.parseInt(endStr, 10);
    if (Number.isNaN(suffix) || suffix <= 0) return "invalid";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number.parseInt(startStr, 10);
    if (Number.isNaN(start) || start < 0) return "invalid";
    if (endStr.length === 0) {
      end = size - 1;
    } else {
      end = Number.parseInt(endStr, 10);
      if (Number.isNaN(end)) return "invalid";
      if (end >= size) end = size - 1;
    }
  }
  if (start > end || start >= size) return "invalid";
  return { start, end };
}

/* Active content can execute script in the app origin if rendered as a normal
   document. `/files/content` is directly navigable, so active MIME types stay
   inline but receive a sandbox CSP. That lets the browser display the content
   without silently downloading it while preventing same-origin script access.
   Everything gets `nosniff` so a wrong guess cannot promote bytes into a more
   privileged executable type. */

export function registerFilesContentRoute(
  app: FastifyInstance,
  depsArg: Paths | PathDeps,
): void {
  const deps = normaliseDeps(depsArg);

  app.get<{ Querystring: { path_id?: string; root?: string; rel_path?: string } }>(
    "/files/content",
    async (req, reply) => {
      const scoped = await resolveScopedFile(deps, req.query, reply);
      if (scoped === null) return reply;
      const resolved = { canonical: scoped.canonical };

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

      const mime = mimeForExtension(resolved.canonical);
      const range = parseRange(req.headers.range, info.size);

      reply.header("Content-Type", mime);
      reply.header("Accept-Ranges", "bytes");
      reply.header("Cache-Control", "no-store");
      /* Security: project content is served behind a token but the URL is
         directly navigable, so prevent same-origin script execution. */
      reply.header("X-Content-Type-Options", "nosniff");
      if (isActiveContentMime(mime)) {
        reply.header("Content-Security-Policy", "sandbox");
      }

      if (range === "invalid") {
        reply.header("Content-Range", `bytes */${info.size}`);
        return reply.code(416).send({
          code: "RANGE_NOT_SATISFIABLE",
          message: "invalid or out-of-bounds Range header",
        });
      }

      if (range === null) {
        if (info.size > MAX_FULL_BYTES) {
          return reply.code(413).send({
            code: "FILE_TOO_LARGE",
            message: `file is ${info.size} bytes; max full read is ${MAX_FULL_BYTES}. Use a Range request.`,
          });
        }
        reply.header("Content-Length", String(info.size));
        return reply.send(createReadStream(resolved.canonical));
      }

      const length = range.end - range.start + 1;
      reply.code(206);
      reply.header("Content-Length", String(length));
      reply.header(
        "Content-Range",
        `bytes ${range.start}-${range.end}/${info.size}`,
      );
      return reply.send(
        createReadStream(resolved.canonical, {
          start: range.start,
          end: range.end,
        }),
      );
    },
  );
}
