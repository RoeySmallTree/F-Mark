import type {
  ManagedAgentControlResponse,
} from "@f-mark/shared";
import type { FastifyReply } from "fastify";
import type { ManagedAgentsRouteContext } from "../routeContext.js";
import type { ManagedAgentRootBinding as RootBinding } from "../types.js";
import { requireControlParticipant } from "./controlParticipant.js";

export async function setPausedRoute(
  context: ManagedAgentsRouteContext,
  input: {
    encodedId: string;
    scopeInput: { path_id?: unknown; root?: unknown };
    paused: boolean;
    reply: FastifyReply;
  },
): Promise<ManagedAgentControlResponse | { error: string }> {
  const scoped = await requireControlParticipant(context, input);
  if (!scoped.ok) return scoped.body;
  await setPaused(context, scoped.id, scoped.binding, input.paused);
  return context.controlResponse(scoped.id, input.reply, scoped.binding);
}

async function setPaused(
  context: ManagedAgentsRouteContext,
  id: string,
  binding: RootBinding,
  paused: boolean,
): Promise<void> {
  await binding.state.updateControlState(id, { paused });
  await binding.state.appendLog(id, { event: paused ? "pause" : "resume" });
  await context.publishAgentUpdated(id, binding);
}
