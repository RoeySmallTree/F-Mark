import { access, constants } from "node:fs/promises";
import { isAbsolute, resolve as resolvePath } from "node:path";
import { realpathSync } from "node:fs";
import type { FastifyInstance, FastifyReply } from "fastify";
import { paths as makePaths, type Paths } from "../paths.js";
import { activePaths } from "../paths/active.js";
import type { PathContextRef } from "../paths/contextRef.js";
import { registerProjectPath } from "../paths/registry.js";
import {
  bumpRevision,
  mruPush,
  updateState,
  type Favorite,
  type KernelState,
} from "../state/store.js";
import type { Bus } from "../ws/bus.js";
import type { TmuxManager } from "../tmux/manager.js";
import { ensureProjectAuth } from "../auth.js";
import { initProject, readConfig } from "../project.js";

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
  busGetter?: () => Bus,
  /* Optional tmux manager. When provided, /paths/active and DELETE
     /paths/active call manager.rebind so subsequent spawns + listFmark
     scope to the new path. Pre-existing tmux sessions retain their old
     tag and stay visible only from the path they were spawned in. */
  tmuxGetter?: () => TmuxManager | null,
  token?: string | null,
  /* The boot/fallback paths — its config.json carries the kernel's actually
     bound port (index.ts syncs it post-listen). Used to stamp a newly
     initialized switched-to project with the right port instead of the
     default, so hooks/MCP for agents in that path reach this kernel. */
  fallbackPaths?: Paths,
): void {
  /* Mirror sessions.ts initSessionProject: initialize a switched-to project
     with the kernel's actual bound port (read from the boot config), falling
     back to initProject's default only when that config is unavailable. */
  async function initSwitchedProject(target: Paths): Promise<void> {
    let port: number | undefined;
    if (fallbackPaths !== undefined) {
      try {
        port = (await readConfig(fallbackPaths)).port;
      } catch {
        // boot config unreadable — let initProject use its default port
      }
    }
    if (port === undefined) await initProject(target);
    else await initProject(target, port);
  }

  function broadcastSwitch(state: KernelState): void {
    if (!busGetter) return;
    const active = ref.get().active;
    busGetter().publish({
      type: "path-switched",
      activePath: state.activePath,
      pathId: active ? active.pathId() : null,
      revision: state.activeRevision,
    });
  }

  function buildResponse(state: KernelState): {
    activePath: string | null;
    activePathId: string | null;
    activeRevision: number;
    knownPaths: string[];
    favorites: Favorite[];
  } {
    const active = ref.get().active;
    return {
      activePath: state.activePath,
      activePathId: active ? active.pathId() : null,
      activeRevision: state.activeRevision,
      knownPaths: state.knownPaths,
      favorites: state.favorites,
    };
  }

  app.get("/paths", async () => {
    const g = ref.global();
    const state = await updateState(g, (s) => s);
    // Mirror revision into the ref so the WS envelope wrap stays in sync
    // even if state.json was hand-edited between requests.
    ref.setRevision(state.activeRevision);
    return buildResponse(state);
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
    await registerProjectPath(g, validation.canonical);
    // Make the target a usable F-Mark project before it goes active. Boot
    // does this for the boot path (index.ts initProject); a path the user
    // switches to for the first time was never initialized, so without this
    // its .f-mark/config.json is missing and every route that reads config
    // (e.g. GET /managed-agents) 500s with ENOENT. initProject is idempotent
    // and is stamped with the kernel's actual bound port (not the default).
    await initSwitchedProject(makePaths(validation.canonical));
    await ensureProjectAuth(makePaths(validation.canonical), token ?? null);
    ref.setActive(activePaths(validation.canonical));
    ref.setRevision(next.activeRevision);
    // Rebind tmux so subsequent spawns + filtering scope to the new path.
    tmuxGetter?.()?.rebind({ projectRoot: validation.canonical });
    broadcastSwitch(next);
    return buildResponse(next);
  });

  app.delete("/paths/active", async () => {
    const g = ref.global();
    const next = await updateState(g, (s) =>
      bumpRevision({ ...s, activePath: null }),
    );
    ref.setActive(null);
    ref.setRevision(next.activeRevision);
    broadcastSwitch(next);
    return buildResponse(next);
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
