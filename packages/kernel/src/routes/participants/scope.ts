import { paths as makePaths, type Paths } from "../../paths.js";
import type { GlobalPaths } from "../../paths/global.js";
import {
  createAgentStateStore,
  createAgentStateStoreForRoot,
} from "../../services/agentState.js";
import { resolveKnownRootScope } from "../rootScope.js";
import type { ParticipantRouteDeps, ParticipantScopeResult } from "./types.js";

function resolveParticipantPaths(deps: ParticipantRouteDeps): Paths {
  if (deps.ref) {
    const active = deps.ref.get().active;
    if (active !== null) return makePaths(active.root());
  }
  return deps.fallback;
}

export function resolveParticipantGlobalPaths(
  deps: ParticipantRouteDeps,
): GlobalPaths | null {
  if (deps.ref !== undefined) return deps.ref.global();
  return deps.global ?? null;
}

export async function resolveParticipantScope(
  deps: ParticipantRouteDeps,
  scope: { path_id?: unknown; root?: unknown },
): Promise<ParticipantScopeResult> {
  if (hasExplicitScope(scope)) {
    const resolved = await resolveKnownRootScope(deps, scope);
    if (!resolved.ok) return resolved;
    return {
      ok: true,
      paths: resolved.known.paths,
      agentState: createAgentStateStoreForRoot(
        resolved.known.root,
        deps.ref?.global(),
      ),
    };
  }
  return {
    ok: true,
    paths: resolveParticipantPaths(deps),
    agentState: createAgentStateStore(deps),
  };
}

function hasExplicitScope(scope: {
  path_id?: unknown;
  root?: unknown;
}): boolean {
  return (
    (typeof scope.path_id === "string" && scope.path_id.length > 0) ||
    (typeof scope.root === "string" && scope.root.length > 0)
  );
}
