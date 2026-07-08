import type { Paths } from "../../paths.js";
import type { PathContextRef } from "../../paths/contextRef.js";
import { computePathId } from "../../paths/identity.js";
import { listRegisteredProjectPaths } from "../../paths/registry.js";
import type { Favorite, KernelState } from "../../state/store.js";

export interface PathRegistryEntry {
  path: string;
  path_id: string;
  favorite?: string;
  registered: boolean;
}

export interface PathsResponse {
  paths: PathRegistryEntry[];
  fallbackPath: string | null;
  fallbackPathId: string | null;
  /** @deprecated Compatibility alias for fallbackPath. New clients should
      select roots from session metadata or paths[]. */
  activePath: string | null;
  /** @deprecated Compatibility alias for fallbackPathId. Kept internally
      consistent with activePath during the active-path model migration. */
  activePathId: string | null;
  /** @deprecated Legacy active-root revision. Registry updates do not rely on
      this as a selected-root staleness boundary. */
  activeRevision: number;
  knownPaths: string[];
  favorites: Favorite[];
}

export async function buildPathsResponse(
  state: KernelState,
  ref: PathContextRef,
  fallbackPaths: Paths | undefined,
): Promise<PathsResponse> {
  const registered = await registeredProjectPaths(ref);
  const paths = pathRegistryEntries(state, registered, fallbackRoot(ref, fallbackPaths));
  const fallbackPath = state.activePath ?? fallbackRoot(ref, fallbackPaths);
  const fallbackPathId =
    fallbackPath !== null ? computePathId(fallbackPath) : null;
  return {
    paths,
    fallbackPath,
    fallbackPathId,
    activePath: fallbackPath,
    activePathId: fallbackPathId,
    activeRevision: state.activeRevision,
    knownPaths: state.knownPaths,
    favorites: state.favorites,
  };
}

function pathRegistryEntries(
  state: KernelState,
  registered: Set<string>,
  fallbackPath: string | null,
): PathRegistryEntry[] {
  const builder = new PathRegistryBuilder(state.favorites, registered);
  builder.push(state.activePath);
  for (const path of state.knownPaths) builder.push(path);
  for (const favorite of state.favorites) builder.push(favorite.path);
  for (const path of registered) builder.push(path);
  builder.push(fallbackPath);
  return builder.entries;
}

async function registeredProjectPaths(
  ref: PathContextRef,
): Promise<Set<string>> {
  try {
    return new Set(await listRegisteredProjectPaths(ref.global()));
  } catch {
    return new Set();
  }
}

function fallbackRoot(
  ref: PathContextRef,
  fallbackPaths: Paths | undefined,
): string | null {
  return fallbackPaths?.root() ?? ref.get().active?.root() ?? null;
}

class PathRegistryBuilder {
  readonly entries: PathRegistryEntry[] = [];
  private readonly favoriteByPath: Map<string, string>;
  private readonly seen = new Set<string>();

  constructor(
    favorites: Favorite[],
    private readonly registered: Set<string>,
  ) {
    this.favoriteByPath = new Map(
      favorites.map((favorite) => [favorite.path, favorite.name]),
    );
  }

  push(path: string | null): void {
    if (path === null || path.length === 0 || this.seen.has(path)) return;
    this.seen.add(path);
    this.entries.push({
      path,
      path_id: computePathId(path),
      ...(this.favoriteByPath.has(path)
        ? { favorite: this.favoriteByPath.get(path)! }
        : {}),
      registered: this.registered.has(path),
    });
  }
}
