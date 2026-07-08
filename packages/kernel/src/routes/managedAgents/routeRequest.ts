import type { FastifyReply } from "fastify";
import { isValidParticipantId } from "../../participants.js";
import type { ManagedAgentRootBinding } from "./types.js";
import type {
  RootBindingResult,
  RootScopeInput,
} from "./rootBinding.js";

type ErrorBody = { error: string };

export type RootScopeResolver = (
  input: RootScopeInput,
) => Promise<RootBindingResult>;

export function requireParticipantId(
  encodedId: string,
  reply: FastifyReply,
): { ok: true; id: string } | { ok: false; body: ErrorBody } {
  const id = decodeURIComponent(encodedId);
  if (!isValidParticipantId(id)) {
    reply.code(400);
    return { ok: false, body: { error: "invalid id" } };
  }
  return { ok: true, id };
}

export async function requireScopedBinding(
  input: {
    scopeInput: RootScopeInput;
    reply: FastifyReply;
    resolveScope: RootScopeResolver;
  },
): Promise<
  | { ok: true; binding: ManagedAgentRootBinding }
  | { ok: false; body: ErrorBody }
> {
  const scoped = await input.resolveScope(input.scopeInput);
  if (!scoped.ok) {
    input.reply.code(scoped.status);
    return { ok: false, body: { error: scoped.error } };
  }
  return { ok: true, binding: scoped.binding };
}

export async function requireScopedParticipant(
  input: {
    encodedId: string;
    scopeInput: RootScopeInput;
    reply: FastifyReply;
    resolveScope: RootScopeResolver;
  },
): Promise<
  | { ok: true; id: string; binding: ManagedAgentRootBinding }
  | { ok: false; body: ErrorBody }
> {
  const participant = requireParticipantId(input.encodedId, input.reply);
  if (!participant.ok) return participant;

  const scoped = await requireScopedBinding(input);
  if (!scoped.ok) return scoped;

  return {
    ok: true,
    id: participant.id,
    binding: scoped.binding,
  };
}
