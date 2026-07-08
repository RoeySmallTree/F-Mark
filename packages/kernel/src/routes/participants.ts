import type { FastifyInstance } from "fastify";
import {
  normaliseParticipantRouteDeps,
} from "./participants/types.js";
import {
  registerCreateAgentRoute,
  registerListParticipantsRoute,
  registerUpdateParticipantRoute,
} from "./participants/routes.js";

export function registerParticipantRoutes(
  app: FastifyInstance,
  pOrDeps: Parameters<typeof normaliseParticipantRouteDeps>[0],
): void {
  const deps = normaliseParticipantRouteDeps(pOrDeps);
  registerListParticipantsRoute(app, deps);
  registerCreateAgentRoute(app, deps);
  registerUpdateParticipantRoute(app, deps);
}
