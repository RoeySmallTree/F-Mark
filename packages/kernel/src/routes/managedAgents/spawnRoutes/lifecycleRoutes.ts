import type { FastifyInstance } from "fastify";
import type { AgentStateStore } from "../../../services/agentState.js";
import type { ManagedAgentsRouteContext } from "../routeContext.js";
import { requireParticipantId, requireScopedBinding } from "../routeRequest.js";
import {
  consumeRequestNonce,
  mintRequestNonce,
  type RequestNonceStore,
} from "./requestNonces.js";

export function registerLifecycleRoutes(
  app: FastifyInstance,
  context: ManagedAgentsRouteContext,
  requestNonces: RequestNonceStore,
): void {
  app.get<{ Params: { id: string } }>(
    "/managed-agents/:id/confirm-token",
    async (req, reply) => {
      const participant = requireParticipantId(req.params.id, reply);
      if (!participant.ok) return participant.body;
      return { token: mintRequestNonce(requestNonces, participant.id) };
    },
  );

  app.delete<{
    Params: { id: string };
    Querystring: { confirm?: string; path_id?: string; root?: string };
  }>(
    "/managed-agents/:id",
    async (req, reply) => {
      const participant = requireParticipantId(req.params.id, reply);
      if (!participant.ok) return participant.body;
      const id = participant.id;

      if (!consumeRequestNonce(requestNonces, id, req.query.confirm ?? "")) {
        reply.code(403);
        return { error: "missing or stale confirm token" };
      }

      const scoped = await requireScopedBinding({
        scopeInput: req.query,
        reply,
        resolveScope: context.optionalRootBinding,
      });
      if (!scoped.ok) return scoped.body;

      await killManagedAgent(context, scoped.binding, id);
      return { ok: true };
    },
  );
}

async function killManagedAgent(
  context: ManagedAgentsRouteContext,
  binding: Parameters<ManagedAgentsRouteContext["publishAgentUpdated"]>[1] & {
    state: AgentStateStore;
  },
  id: string,
): Promise<void> {
  const activeSession = await binding.state.readActiveSession(id);
  const session = await binding.state.readTmuxSession(id);
  const runtimeId = await binding.state.readRuntime(id);
  const control = await binding.state.readControlState(id);
  const lastTmuxSession = session ?? control.last_tmux_session ?? null;
  if (session) {
    try {
      await context.tmux.killSession(session);
    } catch {
      // tolerate already-dead session - the goal is to clear state
    }
  }

  await binding.state.clearManagedSiblings(id);
  await binding.state.clearActiveSession(id);
  if (activeSession !== null) {
    await binding.state.markSessionRemoved(id, {
      sessionId: activeSession,
      runtimeId,
      reason: "goodbye",
      lastTmuxSession,
    });
  }
  await binding.state.updateControlState(id, {
    activity_state: "idle",
    idle_stopped_at: null,
    idle_stop_reason: null,
    last_tmux_session: lastTmuxSession,
    pane_lifecycle: "dead",
  });
  context.tracker.clearManagedPane(id);
  await binding.state.appendLog(id, {
    event: "goodbye",
    session_id: activeSession,
    path_id: binding.pathId ?? null,
  });
  context.bus.publish({
    type: "managed-agent.killed",
    participant_id: id,
    ...(binding.pathId !== undefined ? { pathId: binding.pathId } : {}),
    ...(binding.revision !== undefined ? { revision: binding.revision } : {}),
  });
}
