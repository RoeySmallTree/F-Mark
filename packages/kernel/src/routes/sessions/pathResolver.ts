import type { SessionWithPath } from "@f-mark/shared";
import { paths as makePaths, type Paths } from "../../paths.js";
import { computePathId } from "../../paths/identity.js";
import { registerProjectPath } from "../../paths/registry.js";
import { listSessions } from "../../sessions.js";
import { mruPush, updateState } from "../../state/store.js";
import { listKnownRoots, resolveKnownRootScope } from "../rootScope.js";
import type {
  ScopedSessionPathsResult,
  SessionRouteDeps,
  SessionScopeInput,
} from "./types.js";

export class SessionPathResolver {
  constructor(private readonly deps: SessionRouteDeps) {}

  resolveListPaths(): Paths {
    if (this.deps.ref) {
      const active = this.deps.ref.get().active;
      if (active !== null) {
        // ActivePaths and Paths share the relevant subset (root/sessionsDir/etc.)
        return makePaths(active.root());
      }
    }
    return this.deps.fallback;
  }

  async listSessionsAcrossPaths(): Promise<SessionWithPath[]> {
    const roots = await listKnownRoots(this.deps);
    /* List every known root's sessions in parallel rather than sequentially —
       with ~100 registered roots the old serial loop was the dominant cost of
       /sessions?scope=all. */
    const perRoot = await Promise.all(
      roots.map(async (known) => {
        try {
          const list = await listSessions(known.paths);
          return list.map((session) => ({
            ...session,
            path: known.root,
            path_id: known.path_id,
          }));
        } catch {
          return [] as SessionWithPath[];
        }
      }),
    );
    const sessions = perRoot.flat();
    sessions.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return sessions;
  }

  async resolveScopedPaths(
    input: SessionScopeInput,
  ): Promise<ScopedSessionPathsResult> {
    if (hasRootScope(input)) {
      const resolved = await resolveKnownRootScope(this.deps, {
        path_id: input.path_id,
        root: input.root,
      });
      if (!resolved.ok) return resolved;
      return { ok: true, paths: resolved.known.paths };
    }
    if (typeof input.path === "string" && input.path.length > 0) {
      return { ok: true, paths: makePaths(input.path) };
    }
    return { ok: true, paths: this.resolveListPaths() };
  }

  async registerRoot(root: string): Promise<void> {
    if (!this.deps.ref) return;
    await updateState(this.deps.ref.global(), (s) => mruPush(s, root));
    await registerProjectPath(this.deps.ref.global(), root);
  }

  withPathMetadata<T extends { id: string; slug: string; created_at: string }>(
    session: T,
    p: Paths,
  ): T & { path: string; path_id: string } {
    return {
      ...session,
      path: p.root(),
      path_id: computePathId(p.root()),
    };
  }
}

function hasRootScope(input: SessionScopeInput): boolean {
  return (
    (typeof input.path_id === "string" && input.path_id.length > 0) ||
    (typeof input.root === "string" && input.root.length > 0)
  );
}
