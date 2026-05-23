import type { FastifyInstance } from "fastify";
import { isValidParticipantId } from "../participants.js";
import type { PresenceTracker } from "../presence/tracker.js";

export function registerPresenceRoutes(
  app: FastifyInstance,
  getTracker: () => PresenceTracker,
): void {
  app.post<{ Params: { id: string } }>("/agents/:id/ping", async (req, reply) => {
    const id = decodeURIComponent(req.params.id);
    if (!isValidParticipantId(id)) {
      reply.code(400);
      return { error: "invalid participant_id" };
    }
    getTracker().ping(id);
    reply.code(204);
    return null;
  });
}
