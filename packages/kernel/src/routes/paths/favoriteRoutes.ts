import type { FastifyInstance } from "fastify";
import { isAbsolute } from "node:path";
import { updateState, type Favorite } from "../../state/store.js";
import type { PathRouteContext } from "./routeContext.js";

export function registerFavoritePathRoutes(
  app: FastifyInstance,
  context: PathRouteContext,
): void {
  app.post<{ Body: { name?: string; path?: string } }>(
    "/paths/favorites",
    async (req, reply) => {
      const favorite = favoriteFromBody(req.body?.name, req.body?.path);
      if (!favorite.ok) {
        return context.sendError(reply, 400, favorite.body);
      }
      const result = await addFavorite(context, favorite.value);
      if (result.conflict) {
        return context.sendError(reply, 409, {
          code: "FAVORITE_EXISTS",
          message: "a favorite for this path already exists",
        });
      }
      await context.responseAndBroadcast(result.state);
      return { favorites: result.state.favorites };
    },
  );

  app.delete<{ Querystring: { path?: string } }>(
    "/paths/favorites",
    async (req, reply) => {
      const target = context.queryPathOrSend(req.query.path, reply);
      if (target === null) return reply;
      const next = await updateState(context.global(), (state) => ({
        ...state,
        favorites: state.favorites.filter((favorite) => favorite.path !== target),
      }));
      await context.responseAndBroadcast(next);
      return { favorites: next.favorites };
    },
  );

  app.patch<{ Body: { path?: string; newName?: string } }>(
    "/paths/favorites",
    async (req, reply) => {
      const rename = renameFavoriteFromBody(req.body?.path, req.body?.newName);
      if (!rename.ok) {
        return context.sendError(reply, 400, rename.body);
      }
      const result = await renameFavorite(context, rename.value);
      if (result.missing) {
        return context.sendError(reply, 404, {
          code: "FAVORITE_NOT_FOUND",
          message: "no favorite for that path",
        });
      }
      await context.responseAndBroadcast(result.state);
      return { favorites: result.state.favorites };
    },
  );
}

type FavoriteBodyResult =
  | { ok: true; value: Favorite }
  | { ok: false; body: { code: string; message: string } };

function favoriteFromBody(name: unknown, path: unknown): FavoriteBodyResult {
  if (typeof name !== "string" || name.trim().length === 0) {
    return {
      ok: false,
      body: { code: "NAME_REQUIRED", message: "favorite name is required" },
    };
  }
  if (typeof path !== "string" || !isAbsolute(path)) {
    return {
      ok: false,
      body: {
        code: "PATH_NOT_ABSOLUTE",
        message: "favorite path must be absolute",
      },
    };
  }
  return { ok: true, value: { name: name.trim(), path } };
}

interface RenameFavorite {
  path: string;
  newName: string;
}

type RenameBodyResult =
  | { ok: true; value: RenameFavorite }
  | { ok: false; body: { code: string; message: string } };

function renameFavoriteFromBody(
  path: unknown,
  newName: unknown,
): RenameBodyResult {
  if (typeof path !== "string" || path.length === 0) {
    return {
      ok: false,
      body: { code: "PATH_REQUIRED", message: "path is required" },
    };
  }
  if (typeof newName !== "string" || newName.trim().length === 0) {
    return {
      ok: false,
      body: { code: "NAME_REQUIRED", message: "newName is required" },
    };
  }
  return { ok: true, value: { path, newName: newName.trim() } };
}

async function addFavorite(
  context: PathRouteContext,
  favorite: Favorite,
): Promise<{ state: Awaited<ReturnType<typeof updateState>>; conflict: boolean }> {
  let conflict = false;
  const state = await updateState(context.global(), (current) => {
    if (current.favorites.some((item) => item.path === favorite.path)) {
      conflict = true;
      return current;
    }
    return { ...current, favorites: [...current.favorites, favorite] };
  });
  return { state, conflict };
}

async function renameFavorite(
  context: PathRouteContext,
  rename: RenameFavorite,
): Promise<{ state: Awaited<ReturnType<typeof updateState>>; missing: boolean }> {
  let missing = false;
  const state = await updateState(context.global(), (current) => {
    const index = current.favorites.findIndex(
      (favorite) => favorite.path === rename.path,
    );
    if (index < 0) {
      missing = true;
      return current;
    }
    const favorites = [...current.favorites];
    favorites[index] = { ...favorites[index]!, name: rename.newName };
    return { ...current, favorites };
  });
  return { state, missing };
}
