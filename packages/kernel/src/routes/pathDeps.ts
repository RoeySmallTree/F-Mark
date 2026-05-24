import { paths as makePaths, type Paths } from "../paths.js";
import type { PathContextRef } from "../paths/contextRef.js";

/* Standard deps shape used by every route that touches per-path data
   (sessions, participants, events, todos, files, flow, html, raw, search,
   presets, guide, hookInstall, envProbe). The legacy `Paths`-only call
   sites still work because each route's `register*` accepts either a
   plain `Paths` or `{ fallback, ref }`. */
export interface PathDeps {
  /** Used when no multi-path ref is wired (existing tests pass `paths(root)`
      directly), or when the ref's active path is null. */
  fallback: Paths;
  /** When set and `ref.get().active !== null`, the route resolves paths
      against the active path instead of the fallback. */
  ref?: PathContextRef;
}

export function normaliseDeps(arg: Paths | PathDeps): PathDeps {
  return "fallback" in arg ? arg : { fallback: arg };
}

/* Resolve the Paths object a request handler should use right now.
   Reads the ref synchronously on every call so a /paths/active switch
   between two requests is reflected immediately. */
export function resolvePaths(deps: PathDeps): Paths {
  if (deps.ref) {
    const active = deps.ref.get().active;
    if (active !== null) return makePaths(active.root());
  }
  return deps.fallback;
}
