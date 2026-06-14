import type { FastifyInstance } from "fastify";
import type { LinkAgentRequest } from "@f-mark/shared";
import { paths as makePaths, type Paths } from "../paths.js";
import type { PathContextRef } from "../paths/contextRef.js";
import { isValidParticipantId } from "../participants.js";
import { sessionExists } from "../sessions.js";
import { createAgentStateStore } from "../services/agentState.js";

interface LinkParams {
  id: string;
}

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

  app.post<{ Params: LinkParams; Body: LinkAgentRequest }>(
    "/agents/:id/link",
    {
      schema: {
        body: {
          type: "object",
          required: ["session_id"],
          properties: { session_id: { type: "string", minLength: 1 } },
        },
      },
    },
    async (req, reply) => {
      const participantId = decodeURIComponent(req.params.id);
      if (!isValidParticipantId(participantId)) {
        reply.code(400);
        return { error: "invalid participant_id" };
      }
      const p = resolvePaths(deps);
      if (!(await sessionExists(p, req.body.session_id))) {
        reply.code(404);
        return { error: "session not found" };
      }
      const agentState = createAgentStateStore(deps);
      await agentState.writeActiveSession(participantId, req.body.session_id);
      return { participant_id: participantId, session_id: req.body.session_id };
    },
  );
}
