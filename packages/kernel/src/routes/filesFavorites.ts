import { isAbsolute, join, sep, normalize as normPath } from "node:path";
import { realpath } from "node:fs/promises";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { Paths } from "../paths.js";
import {
  normaliseDeps,
  resolvePaths,
  type PathDeps,
} from "./pathDeps.js";
import {
  readFavoritesFile,
  updateFavoritesFile,
  type FilesFavoritesFile,
} from "../state/filesFavoritesStore.js";

type Scope = "project" | "session";

interface ErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

function send(reply: FastifyReply, status: number, body: ErrorBody): FastifyReply {
  return reply.code(status).send(body);
}

function parseScope(raw: unknown): Scope | null {
  return raw === "project" || raw === "session" ? raw : null;
}

function favoritesFile(
  paths: Paths,
  scope: Scope,
  sessionId: string | null,
): { ok: true; file: string } | { ok: false; status: number; body: ErrorBody } {
  if (scope === "project") {
    return { ok: true, file: join(paths.fmarkDir(), "files-favorites.json") };
  }
  if (sessionId === null || sessionId.length === 0) {
    return {
      ok: false,
      status: 400,
      body: { code: "SESSION_ID_REQUIRED", message: "sessionId is required for session scope" },
    };
  }
  return {
    ok: true,
    file: join(paths.sessionDir(sessionId), "files-favorites.json"),
  };
}

/* Resolve `raw` to a canonical absolute path that is inside `projectRoot`.
   Returns the canonical path on success. The favorites file stores the
   canonical path so toggling via different representations of the same
   file (e.g. with/without symlink) does not produce duplicates. */
async function validateFavoritePath(
  raw: unknown,
  projectRoot: string,
): Promise<{ ok: true; canonical: string } | { ok: false; status: number; body: ErrorBody }> {
  if (typeof raw !== "string" || raw.length === 0) {
    return {
      ok: false,
      status: 400,
      body: { code: "PATH_REQUIRED", message: "path is required" },
    };
  }
  if (!isAbsolute(raw)) {
    return {
      ok: false,
      status: 400,
      body: { code: "PATH_NOT_ABSOLUTE", message: "path must be absolute" },
    };
  }
  let canonical: string;
  try {
    canonical = await realpath(raw);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? "EUNKNOWN";
    if (code === "ENOENT" || code === "ENOTDIR") {
      return {
        ok: false,
        status: 404,
        body: { code: "PATH_NOT_FOUND", message: `path not found: ${raw}` },
      };
    }
    return {
      ok: false,
      status: 400,
      body: {
        code: "PATH_NOT_CANONICAL",
        message: `could not canonicalize: ${raw}`,
        details: { errno: code },
      },
    };
  }
  const rootWithSep = projectRoot.endsWith(sep) ? projectRoot : projectRoot + sep;
  if (canonical !== projectRoot && !canonical.startsWith(rootWithSep)) {
    return {
      ok: false,
      status: 403,
      body: {
        code: "PATH_OUTSIDE_PROJECT",
        message: "favorite path must live inside the active project",
        details: { path: canonical, projectRoot },
      },
    };
  }
  return { ok: true, canonical };
}

export function registerFilesFavoritesRoutes(
  app: FastifyInstance,
  depsArg: Paths | PathDeps,
): void {
  const deps = normaliseDeps(depsArg);

  app.get<{ Querystring: { scope?: string; sessionId?: string } }>(
    "/files/favorites",
    async (req, reply) => {
      const scope = parseScope(req.query.scope);
      if (scope === null) {
        return send(reply, 400, {
          code: "SCOPE_INVALID",
          message: "scope must be 'project' or 'session'",
        });
      }
      const paths = resolvePaths(deps);
      const file = favoritesFile(paths, scope, req.query.sessionId ?? null);
      if (!file.ok) return send(reply, file.status, file.body);
      const data: FilesFavoritesFile = await readFavoritesFile(file.file);
      return data;
    },
  );

  app.post<{
    Body: { scope?: string; sessionId?: string; path?: string };
  }>("/files/favorites", async (req, reply) => {
    const scope = parseScope(req.body?.scope);
    if (scope === null) {
      return send(reply, 400, {
        code: "SCOPE_INVALID",
        message: "scope must be 'project' or 'session'",
      });
    }
    const paths = resolvePaths(deps);
    const projectRoot = normPath(paths.root());
    const file = favoritesFile(paths, scope, req.body?.sessionId ?? null);
    if (!file.ok) return send(reply, file.status, file.body);
    const validated = await validateFavoritePath(req.body?.path, projectRoot);
    if (!validated.ok) return send(reply, validated.status, validated.body);

    let conflict = false;
    const next = await updateFavoritesFile(file.file, (cur) => {
      if (cur.paths.includes(validated.canonical)) {
        conflict = true;
        return cur;
      }
      return { paths: [...cur.paths, validated.canonical] };
    });
    if (conflict) {
      return send(reply, 409, {
        code: "FAVORITE_EXISTS",
        message: "path is already favorited at this scope",
      });
    }
    return reply.code(201).send(next);
  });

  app.delete<{
    Querystring: { scope?: string; sessionId?: string; path?: string };
  }>("/files/favorites", async (req, reply) => {
    const scope = parseScope(req.query.scope);
    if (scope === null) {
      return send(reply, 400, {
        code: "SCOPE_INVALID",
        message: "scope must be 'project' or 'session'",
      });
    }
    const target = req.query.path;
    if (typeof target !== "string" || target.length === 0) {
      return send(reply, 400, {
        code: "PATH_REQUIRED",
        message: "path query param is required",
      });
    }
    const paths = resolvePaths(deps);
    const file = favoritesFile(paths, scope, req.query.sessionId ?? null);
    if (!file.ok) return send(reply, file.status, file.body);
    /* DELETE does not require the path to canonicalize/exist — the caller
       may be removing a fav for a file that has since been deleted. We
       match the stored value (canonical at the time of POST) and any
       direct string match as well, to be forgiving. */
    const next = await updateFavoritesFile(file.file, (cur) => ({
      paths: cur.paths.filter((p) => p !== target),
    }));
    return next;
  });
}
