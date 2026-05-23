import type { FastifyInstance } from "fastify";
import type { Paths } from "../paths.js";
import { isValidParticipantId } from "../participants.js";
import { sessionExists } from "../sessions.js";
import { writeActiveSession } from "../agents/activeSession.js";

interface LinkParams {
  id: string;
}

interface LinkBody {
  session_id: string;
}

export function registerAgentsRoutes(app: FastifyInstance, p: Paths): void {
  app.post<{ Params: LinkParams; Body: LinkBody }>(
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
      if (!(await sessionExists(p, req.body.session_id))) {
        reply.code(404);
        return { error: "session not found" };
      }
      await writeActiveSession(p.fmarkDir(), participantId, req.body.session_id);
      return { participant_id: participantId, session_id: req.body.session_id };
    },
  );
}
