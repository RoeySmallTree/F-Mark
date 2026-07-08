import type { FastifyReply } from "fastify";
import { requireScopedParticipant } from "../routeRequest.js";
import type { ManagedAgentsRouteContext } from "../routeContext.js";

export function requireControlParticipant(
  context: ManagedAgentsRouteContext,
  input: {
    encodedId: string;
    scopeInput: { path_id?: unknown; root?: unknown };
    reply: FastifyReply;
  },
) {
  return requireScopedParticipant({
    encodedId: input.encodedId,
    scopeInput: input.scopeInput,
    reply: input.reply,
    resolveScope: context.optionalRootBinding,
  });
}
