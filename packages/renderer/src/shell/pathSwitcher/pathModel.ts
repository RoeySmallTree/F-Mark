import type {
  PathFavorite,
  PathsResponse,
  SessionMeta,
} from "../../api/client.js";

export interface PathSwitcherModel {
  favorites: PathFavorite[];
  recents: string[];
}

export function basename(absPath: string | null | undefined): string {
  if (absPath === null || absPath === undefined || absPath.length === 0) {
    return "no path";
  }
  const trimmed = absPath.replace(/\/+$/, "");
  const slash = trimmed.lastIndexOf("/");
  if (slash < 0) return trimmed;
  return trimmed.slice(slash + 1) || trimmed;
}

export function createPathSwitcherModel(
  knownPaths: string[],
  favorites: PathFavorite[],
): PathSwitcherModel {
  const favoritePaths = new Set(favorites.map((favorite) => favorite.path));
  return {
    favorites,
    recents: knownPaths.filter((path) => !favoritePaths.has(path)),
  };
}

export function resolveTargetPathId(
  pathsState: PathsResponse,
  target: string,
): string | null {
  const entry = pathsState.paths?.find((path) => path.path === target);
  return entry?.path_id ?? (pathsState.activePath === target ? pathsState.activePathId : null);
}

export function sessionsForPath(
  sessions: SessionMeta[],
  targetPathId: string | null,
  target: string,
): SessionMeta[] {
  return sessions.filter((session) => {
    if (targetPathId !== null && session.path_id !== undefined) {
      return session.path_id === targetPathId;
    }
    return session.path === target;
  });
}
