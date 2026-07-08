import type { FastifyReply } from "fastify";
import { sessionExists } from "../../../sessions.js";
import { requireScopedBinding } from "../routeRequest.js";
import type { RootScopeInput } from "../rootBinding.js";
import type { ManagedAgentRootBinding } from "../types.js";
import type { ManagedAgentsRouteContext } from "../routeContext.js";

type SessionBindingResult =
  | { ok: true; binding: ManagedAgentRootBinding }
  | { ok: false; body: { error: string } };

interface RequireSessionBindingInput {
  context: ManagedAgentsRouteContext;
  reply: FastifyReply;
  sessionId: string;
  scopeInput: RootScopeInput;
  required: boolean;
}

export async function requireSessionBinding({
  context,
  reply,
  sessionId,
  scopeInput,
  required,
}: RequireSessionBindingInput): Promise<SessionBindingResult> {
  const scoped = await requireScopedBinding({
    scopeInput,
    reply,
    resolveScope: required
      ? context.requiredRootBinding
      : context.optionalRootBinding,
  });
  if (!scoped.ok) return scoped;

  if (!(await sessionExists(scoped.binding.paths, sessionId))) {
    reply.code(404);
    return { ok: false, body: { error: `session not found: ${sessionId}` } };
  }

  return { ok: true, binding: scoped.binding };
}
