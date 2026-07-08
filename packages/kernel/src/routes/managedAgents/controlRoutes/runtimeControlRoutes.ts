import type { ManagedAgentControlRequest } from "@f-mark/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ManagedAgentsRouteContext } from "../routeContext.js";
import { requireControlParticipant } from "./controlParticipant.js";
import { sendRuntimeControl } from "./runtimeControlAction.js";

type ScopedControlParticipant = Extract<
  Awaited<ReturnType<typeof requireControlParticipant>>,
  { ok: true }
>;

export function registerManagedAgentRuntimeControlRoutes(
  app: FastifyInstance,
  context: ManagedAgentsRouteContext,
): void {
  registerCompactRoute(app, context);
  registerClearRoute(app, context);
  registerReconnectRoute(app, context);
}

function registerCompactRoute(
  app: FastifyInstance,
  context: ManagedAgentsRouteContext,
): void {
  app.post<{ Params: { id: string }; Body: ManagedAgentControlRequest }>(
    "/managed-agents/:id/compact",
    async (req, reply) => {
      return withControlParticipant(
        context,
        {
          encodedId: req.params.id,
          scopeInput: req.body ?? {},
          reply,
        },
        (scoped) =>
          sendRuntimeControl(
            context,
            scoped.id,
            "compact",
            reply,
            scoped.binding,
          ),
      );
    },
  );
}

async function withControlParticipant<T>(
  context: ManagedAgentsRouteContext,
  input: {
    encodedId: string;
    scopeInput: { path_id?: unknown; root?: unknown };
    reply: FastifyReply;
  },
  handle: (scoped: ScopedControlParticipant) => Promise<T> | T,
): Promise<T | { error: string }> {
  const scoped = await requireControlParticipant(context, input);
  if (!scoped.ok) return scoped.body;
  return handle(scoped);
}

function registerClearRoute(
  app: FastifyInstance,
  context: ManagedAgentsRouteContext,
): void {
  app.post<{ Params: { id: string }; Body: ManagedAgentControlRequest }>(
    "/managed-agents/:id/clear",
    async (req, reply) => {
      return withControlParticipant(
        context,
        {
          encodedId: req.params.id,
          scopeInput: req.body ?? {},
          reply,
        },
        async (scoped) => {
          const id = scoped.id;
          const binding = scoped.binding;
          const result = await sendRuntimeControl(
            context,
            id,
            "clear",
            reply,
            binding,
          );
          if (!("agent" in result)) return result;
          if (result.agent.runtime_session !== null) {
            await binding.state.writeRuntimeSession(id, {
              ...result.agent.runtime_session,
              desired_name: result.agent.active_session,
            });
          }
          return context.controlResponse(id, reply, binding);
        },
      );
    },
  );
}

function registerReconnectRoute(
  app: FastifyInstance,
  context: ManagedAgentsRouteContext,
): void {
  app.post<{ Params: { id: string }; Body: ManagedAgentControlRequest }>(
    "/managed-agents/:id/reconnect",
    async (req, reply) => {
      return withControlParticipant(
        context,
        {
          encodedId: req.params.id,
          scopeInput: req.body ?? {},
          reply,
        },
        async (scoped) => {
          const result = await context.launchService.reconnect({
            participantId: scoped.id,
            binding: scoped.binding,
          });
          reply.code(result.status);
          return result.body;
        },
      );
    },
  );
}
