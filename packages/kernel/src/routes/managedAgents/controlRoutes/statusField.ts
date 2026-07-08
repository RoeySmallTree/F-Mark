import type { AgentStatusRow } from "@f-mark/shared";
import type { FastifyReply } from "fastify";
import { requireParticipantId } from "../routeRequest.js";
import type { ManagedAgentsRouteContext } from "../routeContext.js";

export async function readAgentStatusField<T>(
  context: ManagedAgentsRouteContext,
  encodedId: string,
  reply: FastifyReply,
  select: (agent: AgentStatusRow) => T,
): Promise<T | { error: string }> {
  const participant = requireParticipantId(encodedId, reply);
  if (!participant.ok) return participant.body;
  const id = participant.id;
  const agent = await context.buildStatusRow(id);
  if (agent === null) {
    reply.code(404);
    return { error: `agent not found: ${id}` };
  }
  return select(agent);
}
