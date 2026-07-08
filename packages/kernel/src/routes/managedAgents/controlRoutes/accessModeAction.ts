import type {
  ManagedAgentControlResponse,
} from "@f-mark/shared";
import type { FastifyReply } from "fastify";
import type { ManagedAgentsRouteContext } from "../routeContext.js";
import type { ManagedAgentRootBinding as RootBinding } from "../types.js";

export async function updateAccessMode(
  context: ManagedAgentsRouteContext,
  input: {
    id: string;
    mode: unknown;
    binding: RootBinding;
    reply: FastifyReply;
  },
): Promise<ManagedAgentControlResponse | { error: string }> {
  const agent = await context.buildStatusRow(input.id, input.binding);
  if (agent === null) {
    input.reply.code(404);
    return { error: `agent not found: ${input.id}` };
  }
  if (typeof input.mode !== "string" || input.mode.length === 0) {
    input.reply.code(400);
    return { error: "mode required" };
  }
  if (!agent.access.supported_modes.includes(input.mode)) {
    input.reply.code(400);
    return { error: `unsupported access mode for this runtime: ${input.mode}` };
  }
  await input.binding.state.updateControlState(input.id, {
    access_mode: input.mode,
  });
  await context.publishAgentUpdated(input.id, input.binding);
  return context.controlResponse(input.id, input.reply, input.binding);
}
