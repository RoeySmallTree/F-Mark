import { access, constants } from "node:fs/promises";
import { isAbsolute, resolve as resolvePath } from "node:path";
import { realpathSync } from "node:fs";
import type { FastifyInstance, FastifyReply } from "fastify";
import { activePaths } from "../paths/active.js";
import type { PathContextRef } from "../paths/contextRef.js";
import {
  bumpRevision,
  mruPush,
  updateState,
  type Favorite,
  type KernelState,
} from "../state/store.js";

interface PathErrorShape {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

function sendError(
  reply: FastifyReply,
  status: number,
  body: PathErrorShape,
): FastifyReply {
  return reply.code(status).send(body);
}

interface ValidatePathResult {
  ok: true;
  canonical: string;
}
interface ValidatePathError {
  ok: false;
  status: number;
  body: PathErrorShape;
}

async function validatePath(
  raw: unknown,
): Promise<ValidatePathResult | ValidatePathError> {
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
    canonical = realpathSync(resolvePath(raw));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? "EUNKNOWN";
    if (code === "ENOENT" || code === "ENOTDIR") {
      return {
        ok: false,
        status: 400,
        body: {
          code: "PATH_NOT_FOUND",
          message: `path not found: ${raw}`,
          details: { path: raw },
        },
      };
    }
    return {
      ok: false,
      status: 400,
      body: {
        code: "PATH_NOT_CANONICAL",
        message: `failed to canonicalize path: ${raw}`,
        details: { path: raw, errno: code },
      },
    };
  }
  try {
    await access(canonical, constants.W_OK);
  } catch {
    return {
      ok: false,
      status: 403,
      body: {
        code: "PATH_NOT_WRITABLE",
        message: `path not writable: ${canonical}`,
        details: { path: canonical },
      },
    };
  }
  return { ok: true, canonical };
}

export function registerPathRoutes(
  app: FastifyInstance,
  ref: PathContextRef,
): void {
  app.get("/paths", async () => {
    const g = ref.global();
    const state = await updateState(g, (s) => s);
    return {
      activePath: state.activePath,
      activeRevision: state.activeRevision,
      knownPaths: state.knownPaths,
      favorites: state.favorites,
    };
  });

  app.post<{ Body: { path?: string } }>("/paths/active", async (req, reply) => {
    const validation = await validatePath(req.body?.path);
    if (!validation.ok) return sendError(reply, validation.status, validation.body);
    const g = ref.global();
    const next = await updateState(g, (s) => {
      const promoted = mruPush(
        { ...s, activePath: validation.canonical },
        validation.canonical,
      );
      return bumpRevision(promoted);
    });
    ref.setActive(activePaths(validation.canonical));
    return {
      activePath: next.activePath,
      activeRevision: next.activeRevision,
      knownPaths: next.knownPaths,
      favorites: next.favorites,
    };
  });

  app.delete("/paths/active", async () => {
    const g = ref.global();
    const next = await updateState(g, (s) =>
      bumpRevision({ ...s, activePath: null }),
    );
    ref.setActive(null);
    return {
      activePath: next.activePath,
      activeRevision: next.activeRevision,
      knownPaths: next.knownPaths,
      favorites: next.favorites,
    };
  });

  app.delete<{ Querystring: { path?: string } }>(
    "/paths/known",
    async (req, reply) => {
      const target = req.query.path;
      if (typeof target !== "string" || target.length === 0) {
        return sendError(reply, 400, {
          code: "PATH_REQUIRED",
          message: "path query param is required",
        });
      }
      const g = ref.global();
      const next = await updateState(g, (s) => ({
        ...s,
        knownPaths: s.knownPaths.filter((p) => p !== target),
      }));
      return { knownPaths: next.knownPaths };
    },
  );

  app.post<{ Body: { name?: string; path?: string } }>(
    "/paths/favorites",
    async (req, reply) => {
      const name = req.body?.name;
      const path = req.body?.path;
      if (typeof name !== "string" || name.trim().length === 0) {
        return sendError(reply, 400, {
          code: "NAME_REQUIRED",
          message: "favorite name is required",
        });
      }
      if (typeof path !== "string" || !isAbsolute(path)) {
        return sendError(reply, 400, {
          code: "PATH_NOT_ABSOLUTE",
          message: "favorite path must be absolute",
        });
      }
      const g = ref.global();
      let conflict = false;
      const next = await updateState(g, (s) => {
        if (s.favorites.some((f) => f.path === path)) {
          conflict = true;
          return s;
        }
        const fav: Favorite = { name: name.trim(), path };
        return { ...s, favorites: [...s.favorites, fav] };
      });
      if (conflict) {
        return sendError(reply, 409, {
          code: "FAVORITE_EXISTS",
          message: "a favorite for this path already exists",
        });
      }
      return { favorites: next.favorites };
    },
  );

  app.delete<{ Querystring: { path?: string } }>(
    "/paths/favorites",
    async (req, reply) => {
      const target = req.query.path;
      if (typeof target !== "string" || target.length === 0) {
        return sendError(reply, 400, {
          code: "PATH_REQUIRED",
          message: "path query param is required",
        });
      }
      const g = ref.global();
      const next = await updateState(g, (s) => ({
        ...s,
        favorites: s.favorites.filter((f) => f.path !== target),
      }));
      return { favorites: next.favorites };
    },
  );

  app.patch<{ Body: { path?: string; newName?: string } }>(
    "/paths/favorites",
    async (req, reply) => {
      const path = req.body?.path;
      const newName = req.body?.newName;
      if (typeof path !== "string" || path.length === 0) {
        return sendError(reply, 400, {
          code: "PATH_REQUIRED",
          message: "path is required",
        });
      }
      if (typeof newName !== "string" || newName.trim().length === 0) {
        return sendError(reply, 400, {
          code: "NAME_REQUIRED",
          message: "newName is required",
        });
      }
      const g = ref.global();
      let missing = false;
      const next = await updateState(g, (s) => {
        const idx = s.favorites.findIndex((f) => f.path === path);
        if (idx < 0) {
          missing = true;
          return s;
        }
        const updated: Favorite[] = [...s.favorites];
        updated[idx] = { ...updated[idx]!, name: newName.trim() };
        return { ...s, favorites: updated };
      });
      if (missing) {
        return sendError(reply, 404, {
          code: "FAVORITE_NOT_FOUND",
          message: "no favorite for that path",
        });
      }
      return { favorites: next.favorites };
    },
  );
}

/* Expose for tests that want to seed/read state directly without going
   through the HTTP layer. */
export type { KernelState };
