import { paths as makePaths, type Paths } from "../paths.js";
import type { PathContextRef } from "../paths/contextRef.js";
import type { GlobalPaths } from "../paths/global.js";
import type { TmuxManager } from "../tmux/manager.js";

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
  /** When true, event POSTs from a backgrounded path (different pathId
      than active) bypass the 409 STALE_PATH check. CLI flag
      --quiet-cross-path-hooks; server.ts threads it in. */
  quietCrossPathHooks?: boolean;
  /** Global config tree for root-scoped managed-agent state. Optional so
      legacy tests that pass only Paths keep using per-root .f-mark/agents. */
  global?: GlobalPaths;
  /** Runtime process manager, available once process routes are enabled. Event
      writes use this only to publish a full managed-agent status row after
      lifecycle reconciliation. */
  getTmuxManager?: () => TmuxManager | null;
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
