import type { FastifyReply } from "fastify";
import type { Paths } from "../../paths.js";
import { paths as makePaths } from "../../paths.js";
import { sessionExists } from "../../sessions.js";
import type { Bus } from "../../ws/bus.js";
import type { PathDeps } from "../pathDeps.js";
import { resolveKnownRootScope } from "../rootScope.js";

export class TodoRouteContext {
  constructor(
    readonly deps: PathDeps,
    private readonly getBus: () => Bus,
  ) {}

  bus(): Bus {
    return this.getBus();
  }

  async ensureSession(
    p: Paths,
    sessionId: string,
    reply: FastifyReply,
  ): Promise<boolean> {
    if (await sessionExists(p, sessionId)) return true;
    reply.code(404).send({ error: `session not found: ${sessionId}` });
    return false;
  }

  async readPathsOrSend(
    query: { path_id?: string; root?: string },
    reply: FastifyReply,
  ): Promise<Paths | null> {
    if (!hasExplicitRootScope(query)) {
      const active = this.deps.ref?.get().active ?? null;
      return active !== null ? makePaths(active.root()) : this.deps.fallback;
    }
    const scope = await resolveKnownRootScope(this.deps, {
      path_id: query.path_id,
      root: query.root,
    });
    if (!scope.ok) {
      reply.code(scope.status).send(scope.body);
      return null;
    }
    return scope.known.paths;
  }

  async writeScopeOrSend(
    query: { path_id?: string; root?: string },
    reply: FastifyReply,
  ): ReturnType<typeof resolveKnownRootScope> {
    const scope = await resolveKnownRootScope(this.deps, query);
    if (!scope.ok) reply.code(scope.status);
    return scope;
  }
}

function hasExplicitRootScope(query: {
  path_id?: string;
  root?: string;
}): boolean {
  return (
    (typeof query.path_id === "string" && query.path_id.length > 0) ||
    (typeof query.root === "string" && query.root.length > 0)
  );
}
