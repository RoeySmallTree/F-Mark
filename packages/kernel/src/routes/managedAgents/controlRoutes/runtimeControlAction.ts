import type {
  ManagedAgentControlResponse,
} from "@f-mark/shared";
import type { FastifyReply } from "fastify";
import {
  runtimeControlCommand,
  type RuntimeControlAction,
} from "../../../agents/capabilities.js";
import type { ManagedAgentsRouteContext } from "../routeContext.js";
import type { ManagedAgentRootBinding as RootBinding } from "../types.js";

export async function sendRuntimeControl(
  context: ManagedAgentsRouteContext,
  id: string,
  action: RuntimeControlAction,
  reply: FastifyReply,
  binding: RootBinding,
): Promise<ManagedAgentControlResponse | { error: string }> {
  const agent = await context.buildStatusRow(id, binding);
  if (agent === null) {
    reply.code(404);
    return { error: `agent not found: ${id}` };
  }
  if (!controlAllowed(agent.activity_state)) {
    reply.code(409);
    return { error: `agent is ${agent.activity_state}` };
  }
  if (agent.tmux_session === null || agent.connection_state !== "connected") {
    reply.code(409);
    return { error: "agent pane is not connected" };
  }
  const command = runtimeControlCommand(agent.runtime_id, action);
  if (command === null) {
    reply.code(400);
    return { error: `${action} is unsupported for this runtime` };
  }
  const tmuxSession = agent.tmux_session;
  await context.inputQueue.enqueue(tmuxSession, async () => {
    await context.tmux.sendLiteralText(tmuxSession, command);
    await context.tmux.sendKey(tmuxSession, "C-m");
  });
  await binding.state.appendLog(id, { event: action, command });
  await binding.state.updateControlState(id, {
    last_activity_at: new Date().toISOString(),
    pane_lifecycle: "live",
  });
  await context.publishAgentUpdated(id, binding);
  return context.controlResponse(id, reply, binding);
}

function controlAllowed(activity: string): boolean {
  return (
    activity !== "running" &&
    activity !== "notified" &&
    activity !== "access-pending"
  );
}
