import type { SpawnRequest } from "@f-mark/shared";
import type { FastifyInstance } from "fastify";
import type { ManagedAgentsRouteContext } from "../routeContext.js";
import { requireScopedBinding } from "../routeRequest.js";

export function registerSpawnRoute(
  app: FastifyInstance,
  context: ManagedAgentsRouteContext,
): void {
  /* One spawn at a time per (root, session, runtime). A double-click or
     duplicated request while a spawn is still in flight would otherwise
     create two identical agents; sequential spawns of the same runtime stay
     allowed because the key is released as soon as the first spawn settles. */
  const spawnsInFlight = new Set<string>();

  app.post<{ Body: Partial<SpawnRequest> }>(
    "/managed-agents/spawn",
    async (req, reply) => {
      const body = (req.body ?? {}) as Partial<SpawnRequest>;
      const runtime_id = body.runtime_id;
      if (typeof runtime_id !== "string" || runtime_id.length === 0) {
        reply.code(400);
        return { error: "runtime_id required" };
      }

      const scoped = await requireScopedBinding({
        scopeInput: body,
        reply,
        resolveScope: context.optionalRootBinding,
      });
      if (!scoped.ok) return scoped.body;

      const inFlightKey = [
        scoped.binding.pathId ?? scoped.binding.paths.root(),
        body.session_id ?? "",
        runtime_id,
      ].join("::");
      if (spawnsInFlight.has(inFlightKey)) {
        reply.code(409);
        return {
          error: `a ${runtime_id} agent is already spawning for this session`,
        };
      }
      spawnsInFlight.add(inFlightKey);
      try {
        const result = await context.launchService.spawn({
          body,
          binding: scoped.binding,
        });
        reply.code(result.status);
        return result.body;
      } finally {
        spawnsInFlight.delete(inFlightKey);
      }
    },
  );
}
