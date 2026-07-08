import { paths as makePaths, type Paths } from "../../paths.js";
import { computePathId } from "../../paths/identity.js";
import { listRegisteredProjectPaths } from "../../paths/registry.js";
import { listSessions, sessionExists } from "../../sessions.js";
import { readState } from "../../state/store.js";
import type { PathDeps } from "../pathDeps.js";

export interface SearchTarget {
  p: Paths;
  sessionId: string;
  sessionSlug?: string;
  path?: string;
  pathId?: string;
}

export interface SearchQueryScope {
  session?: string;
  scope?: string;
}

export interface SearchTargetError {
  status: 404;
  error: string;
}

function pushUnique(out: string[], seen: Set<string>, path: string | null): void {
  if (path === null || seen.has(path)) return;
  seen.add(path);
  out.push(path);
}

async function listSearchRoots(deps: PathDeps): Promise<string[]> {
  const roots: string[] = [];
  const seen = new Set<string>();
  if (deps.ref) {
    const ctx = deps.ref.get();
    const state = await readState(deps.ref.global());
    pushUnique(roots, seen, ctx.active?.root() ?? null);
    pushUnique(roots, seen, state.activePath);
    for (const path of state.knownPaths) pushUnique(roots, seen, path);
    for (const favorite of state.favorites) {
      pushUnique(roots, seen, favorite.path);
    }
    for (const path of await listRegisteredProjectPaths(deps.ref.global())) {
      pushUnique(roots, seen, path);
    }
  }
  pushUnique(roots, seen, deps.fallback.root());
  return roots;
}

export class SearchTargetResolver {
  constructor(private readonly deps: PathDeps) {}

  async resolve(
    p: Paths,
    query: SearchQueryScope,
  ): Promise<SearchTarget[] | SearchTargetError> {
    if (typeof query.session === "string" && query.session.length > 0) {
      return this.sessionTarget(p, query.session);
    }
    if (query.scope === "all") {
      return this.allRootTargets();
    }
    return this.localTargets(p);
  }

  private async sessionTarget(
    p: Paths,
    sessionId: string,
  ): Promise<SearchTarget[] | SearchTargetError> {
    if (!(await sessionExists(p, sessionId))) {
      return { status: 404, error: `session not found: ${sessionId}` };
    }
    return [{ p, sessionId }];
  }

  private async allRootTargets(): Promise<SearchTarget[]> {
    const targets: SearchTarget[] = [];
    for (const root of await listSearchRoots(this.deps)) {
      targets.push(...(await this.targetsForRoot(root)));
    }
    return targets;
  }

  private async targetsForRoot(root: string): Promise<SearchTarget[]> {
    const rootPaths = makePaths(root);
    const sessions = await this.safeListSessions(rootPaths);
    const pathId = this.safePathId(root);
    if (sessions === null || pathId === null) return [];
    return sessions.map((session) => ({
      p: rootPaths,
      sessionId: session.id,
      sessionSlug: session.slug,
      path: root,
      pathId,
    }));
  }

  private async safeListSessions(p: Paths) {
    try {
      return await listSessions(p);
    } catch {
      return null;
    }
  }

  private safePathId(root: string): string | null {
    try {
      return computePathId(root);
    } catch {
      return null;
    }
  }

  private async localTargets(p: Paths): Promise<SearchTarget[]> {
    const sessions = await listSessions(p);
    return sessions.map((session) => ({
      p,
      sessionId: session.id,
      sessionSlug: session.slug,
    }));
  }
}
