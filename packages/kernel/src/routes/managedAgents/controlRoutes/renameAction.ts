import type {
  ManagedAgentControlResponse,
} from "@f-mark/shared";
import type { FastifyReply } from "fastify";
import { updateParticipant } from "../../../participants.js";
import type { ManagedAgentsRouteContext } from "../routeContext.js";
import type { ManagedAgentRootBinding as RootBinding } from "../types.js";

export async function renameAgent(
  context: ManagedAgentsRouteContext,
  input: {
    id: string;
    displayName: unknown;
    binding: RootBinding;
    reply: FastifyReply;
  },
): Promise<ManagedAgentControlResponse | { error: string }> {
  if (
    typeof input.displayName !== "string" ||
    input.displayName.trim().length === 0
  ) {
    input.reply.code(400);
    return { error: "display_name required" };
  }
  try {
    await updateParticipant(input.binding.paths, input.id, {
      name: input.displayName,
    });
    await input.binding.state.appendLog(input.id, { event: "rename" });
    await context.publishAgentUpdated(input.id, input.binding);
    return context.controlResponse(input.id, input.reply, input.binding);
  } catch (err) {
    input.reply.code(/not found/i.test(String(err)) ? 404 : 400);
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
