import { normalize as normPath, sep } from "node:path";
import { paths as makePaths, type Paths } from "../paths.js";
import { cachedRealpathSync } from "../paths/realpathCache.js";
import { computePathId } from "../paths/identity.js";
import { listRegisteredProjectPaths } from "../paths/registry.js";
import { readState } from "../state/store.js";
import type { PathDeps } from "./pathDeps.js";

/* ── Root-scope foundation (expansion-decisions.md X2 / X4b) ──────────────

   Every event read/write/wake and every file read must carry a REQUIRED
   root scope — either a `path_id` (the 48-bit fingerprint of a canonical
   root) or an absolute `root` path. There is NO "fall back to the active
   root" behavior: a missing scope is 400 ROOT_SCOPE_REQUIRED and an
   unrecognized scope is 404 UNKNOWN_ROOT.

   The set of *allowed* roots is enumerated by `listKnownRoots`, matching
   the same union used by all-session listing (routes/sessions.ts):
     - the active context root + state.activePath,
     - state.knownPaths,
     - state.favorites[].path,
     - registered project paths (paths/registry.ts),
     - deps.fallback.root().

   This is the only mechanism by which a non-active root becomes readable —
   arbitrary client-supplied paths are never trusted. */

/** Wire/scope shape accepted by scoped routes. Exactly one of the two
    discriminants is meaningful; if both are present they must resolve to
    the same known root. */
export type RootScope =
  | { path_id: string; root?: string }
  | { root: string; path_id?: string };

export interface KnownRoot {
  root: string;
  path_id: string;
  paths: Paths;
  is_active: boolean;
  /** Active revision — only set for the active root so background-root
      publishes don't inject a stale active revision into the WS envelope. */
  revision?: number;
}

export interface RootScopeError {
  ok: false;
  status: number;
  body: { code: string; message: string; details?: Record<string, unknown> };
}

export interface RootScopeOk {
  ok: true;
  known: KnownRoot;
}

/** Canonicalize a path via realpath, falling back to the input for paths
    that don't exist on disk (so an id can still be computed). */
function canonical(absPath: string): string {
  try {
    return cachedRealpathSync(absPath);
  } catch {
    return absPath;
  }
}

/** True when `child` is `root` or lives under it (path-segment aware so
    `/a/bc` is not considered inside `/a/b`). */
export function isWithinRoot(root: string, child: string): boolean {
  const r = normPath(root);
  const c = normPath(child);
  const rWithSep = r.endsWith(sep) ? r : r + sep;
  return c === r || c.startsWith(rWithSep);
}

/* Parameterized project-root guard — replaces the per-route hard-coded
   `paths.root()` check. Returns a structured 403 when `canonicalChild`
   escapes `known.root`. */
export function projectRootGuard(
  root: string,
  canonicalChild: string,
): { ok: true } | RootScopeError {
  if (!isWithinRoot(root, canonicalChild)) {
    return {
      ok: false,
      status: 403,
      body: {
        code: "PATH_OUTSIDE_PROJECT",
        message: "path must live inside the scoped project root",
      },
    };
  }
  return { ok: true };
}

/** Enumerate the allowed project roots (canonicalized + deduped), each with
    its path_id and Paths. Mirrors the all-session enumeration union. */
export async function listKnownRoots(deps: PathDeps): Promise<KnownRoot[]> {
  const seen = new Set<string>();
  const out: KnownRoot[] = [];
  let activeRoot: string | null = null;
  let activeRevision = 0;

  const push = (raw: string | null): void => {
    if (raw === null || raw.length === 0) return;
    const root = canonical(raw);
    if (seen.has(root)) return;
    let pathId: string;
    try {
      pathId = computePathId(root);
    } catch {
      return;
    }
    seen.add(root);
    const isActive = activeRoot !== null && root === activeRoot;
    out.push({
      root,
      path_id: pathId,
      paths: makePaths(root),
      is_active: isActive,
      ...(isActive ? { revision: activeRevision } : {}),
    });
  };

  if (deps.ref !== undefined) {
    const ctx = deps.ref.get();
    activeRoot = ctx.active !== null ? canonical(ctx.active.root()) : null;
    activeRevision = deps.ref.revision();
    let state;
    try {
      state = await readState(deps.ref.global());
    } catch {
      state = null;
    }
    push(ctx.active?.root() ?? null);
    if (state !== null) {
      push(state.activePath);
      for (const path of state.knownPaths) push(path);
      for (const favorite of state.favorites) push(favorite.path);
    }
    try {
      for (const path of await listRegisteredProjectPaths(deps.ref.global())) {
        push(path);
      }
    } catch {
      /* registry unreadable — keep the roots gathered so far. */
    }
  }

  push(deps.fallback.root());
  return out;
}

/** Resolve a required root scope against the known-root set.

    - Missing scope (no path_id and no root) → 400 ROOT_SCOPE_REQUIRED.
    - Unknown scope (not in listKnownRoots) → 404 UNKNOWN_ROOT.
    - Both path_id and root present but pointing at different roots →
      400 ROOT_SCOPE_CONFLICT. */
export async function resolveKnownRootScope(
  deps: PathDeps,
  scope: { path_id?: unknown; root?: unknown },
): Promise<RootScopeOk | RootScopeError> {
  const pathId =
    typeof scope.path_id === "string" && scope.path_id.length > 0
      ? scope.path_id
      : null;
  const rawRoot =
    typeof scope.root === "string" && scope.root.length > 0 ? scope.root : null;

  if (pathId === null && rawRoot === null) {
    return {
      ok: false,
      status: 400,
      body: {
        code: "ROOT_SCOPE_REQUIRED",
        message: "a path_id or root is required",
      },
    };
  }

  const roots = await listKnownRoots(deps);

  let byId: KnownRoot | undefined;
  if (pathId !== null) {
    /* path_id is a 12-char (48-bit) hash prefix — collisions are negligible
       but possible. Collect ALL matches and reject ambiguity rather than
       silently selecting the first, since this is a cross-root auth boundary. */
    const idMatches = roots.filter((r) => r.path_id === pathId);
    if (idMatches.length === 0) {
      return {
        ok: false,
        status: 404,
        body: {
          code: "UNKNOWN_ROOT",
          message: `unknown path_id: ${pathId}`,
        },
      };
    }
    if (idMatches.length > 1 && rawRoot === null) {
      return {
        ok: false,
        status: 409,
        body: {
          code: "AMBIGUOUS_ROOT_SCOPE",
          message: `path_id ${pathId} matches multiple known roots; supply root`,
          details: { roots: idMatches.map((r) => r.root) },
        },
      };
    }
    /* If rawRoot is also supplied, the conflict check below disambiguates;
       pick the match that agrees with rawRoot when possible. */
    byId = idMatches[0];
    if (rawRoot !== null) {
      const canon = canonical(rawRoot);
      byId = idMatches.find((r) => r.root === canon) ?? idMatches[0];
    }
  }

  let byRoot: KnownRoot | undefined;
  if (rawRoot !== null) {
    const canon = canonical(rawRoot);
    byRoot = roots.find((r) => r.root === canon);
    if (byRoot === undefined) {
      return {
        ok: false,
        status: 404,
        body: {
          code: "UNKNOWN_ROOT",
          message: `unknown root: ${rawRoot}`,
        },
      };
    }
  }

  if (byId !== undefined && byRoot !== undefined && byId.root !== byRoot.root) {
    return {
      ok: false,
      status: 400,
      body: {
        code: "ROOT_SCOPE_CONFLICT",
        message: "path_id and root resolve to different roots",
        details: { path_id_root: byId.root, root: byRoot.root },
      },
    };
  }

  const known = (byId ?? byRoot)!;
  return { ok: true, known };
}

/** Predicate: is this absolute root one of the allowed known roots? */
export async function isKnownRoot(
  deps: PathDeps,
  root: string,
): Promise<boolean> {
  const canon = canonical(root);
  const roots = await listKnownRoots(deps);
  return roots.some((r) => r.root === canon);
}
