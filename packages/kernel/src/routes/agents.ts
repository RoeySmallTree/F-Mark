import type { FastifyInstance } from "fastify";
import type { LinkAgentRequest } from "@f-mark/shared";
import { paths as makePaths, type Paths } from "../paths.js";
import type { PathContextRef } from "../paths/contextRef.js";
import { isValidParticipantId } from "../participants.js";
import { sessionExists } from "../sessions.js";
import {
  createAgentStateStore,
  createAgentStateStoreForRoot,
} from "../services/agentState.js";
import { resolveKnownRootScope } from "./rootScope.js";

interface LinkParams {
  id: string;
}

type LinkBody = LinkAgentRequest & {
  path_id?: string;
  root?: string;
};

export interface AgentRouteDeps {
  fallback: Paths;
  ref?: PathContextRef;
}

function resolvePaths(deps: AgentRouteDeps): Paths {
  const active = deps.ref?.get().active ?? null;
  return active !== null ? makePaths(active.root()) : deps.fallback;
}

export function registerAgentsRoutes(
  app: FastifyInstance,
  pOrDeps: Paths | AgentRouteDeps,
): void {
  const deps: AgentRouteDeps =
    "fallback" in pOrDeps ? pOrDeps : { fallback: pOrDeps };

  app.post<{ Params: LinkParams; Body: LinkBody }>(
    "/agents/:id/link",
    {
      schema: {
        body: {
          type: "object",
          required: ["session_id"],
          properties: {
            session_id: { type: "string", minLength: 1 },
            path_id: { type: "string" },
            root: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      const participantId = decodeURIComponent(req.params.id);
      if (!isValidParticipantId(participantId)) {
        reply.code(400);
        return { error: "invalid participant_id" };
      }
      const scoped = await resolveLinkScope(deps, req.body);
      if (!scoped.ok) {
        reply.code(scoped.status);
        return scoped.body;
      }
      const p = scoped.paths;
      if (!(await sessionExists(p, req.body.session_id))) {
        reply.code(404);
        return { error: "session not found" };
      }
      const agentState = scoped.agentState;
      await agentState.writeActiveSession(participantId, req.body.session_id);
      return { participant_id: participantId, session_id: req.body.session_id };
    },
  );
}

async function resolveLinkScope(
  deps: AgentRouteDeps,
  body: LinkBody,
): Promise<
  | {
      ok: true;
      paths: Paths;
      agentState: ReturnType<typeof createAgentStateStore>;
    }
  | { ok: false; status: number; body: { error: string; code?: string } }
> {
  const hasScope =
    (typeof body.path_id === "string" && body.path_id.length > 0) ||
    (typeof body.root === "string" && body.root.length > 0);
  if (!hasScope) {
    if (deps.ref !== undefined) {
      return {
        ok: false,
        status: 400,
        body: {
          code: "ROOT_SCOPE_REQUIRED",
          error: "a path_id or root is required",
        },
      };
    }
    return {
      ok: true,
      paths: resolvePaths(deps),
      agentState: createAgentStateStore(deps),
    };
  }

  const scoped = await resolveKnownRootScope(deps, {
    path_id: body.path_id,
    root: body.root,
  });
  if (!scoped.ok) {
    return {
      ok: false,
      status: scoped.status,
      body: {
        code: scoped.body.code,
        error: scoped.body.message,
      },
    };
  }
  return {
    ok: true,
    paths: scoped.known.paths,
    agentState: createAgentStateStoreForRoot(
      scoped.known.root,
      deps.ref?.global(),
    ),
  };
}
