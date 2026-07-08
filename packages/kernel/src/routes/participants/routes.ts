import type { FastifyInstance, FastifyReply } from "fastify";
import type { RegisterAgentRequest, UpdateParticipantPatch } from "@f-mark/shared";
import {
  listParticipants,
  registerAgent,
  updateParticipant,
} from "../../participants.js";
import {
  overlayUserProfileOnParticipants,
  readUserProfileForProject,
} from "../../userProfile.js";
import {
  registerAgentRouteSchema,
  updateParticipantRouteSchema,
} from "./schemas.js";
import {
  resolveParticipantGlobalPaths,
  resolveParticipantScope,
} from "./scope.js";
import type {
  ParticipantRouteDeps,
  ParticipantScopeResult,
  ScopeQuery,
  UpdateParams,
} from "./types.js";

export function registerListParticipantsRoute(
  app: FastifyInstance,
  deps: ParticipantRouteDeps,
): void {
  app.get<{ Querystring: ScopeQuery }>("/participants", async (req, reply) => {
    const scoped = await resolveScopeOrReply(deps, req.query, reply);
    if (scoped === null) return;
    try {
      const participants = await listParticipants(scoped.paths, {
        agentState: scoped.agentState,
      });
      const global = resolveParticipantGlobalPaths(deps);
      if (global === null) return { participants };
      const profile = await readUserProfileForProject(global, scoped.paths);
      return {
        participants: overlayUserProfileOnParticipants(participants, profile),
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return { participants: {} };
      }
      throw err;
    }
  });
}

export function registerCreateAgentRoute(
  app: FastifyInstance,
  deps: ParticipantRouteDeps,
): void {
  app.post<{ Body: RegisterAgentRequest; Querystring: ScopeQuery }>(
    "/participants/register",
    { schema: registerAgentRouteSchema },
    async (req, reply) => {
      const scoped = await resolveScopeOrReply(deps, req.query, reply);
      if (scoped === null) return;
      try {
        return await registerAgent(scoped.paths, {
          name: req.body.name!,
          suggested_id: req.body.suggested_id,
        });
      } catch (err) {
        reply.code(400);
        return { error: errorMessage(err) };
      }
    },
  );
}

export function registerUpdateParticipantRoute(
  app: FastifyInstance,
  deps: ParticipantRouteDeps,
): void {
  app.patch<{
    Params: UpdateParams;
    Body: UpdateParticipantPatch;
    Querystring: ScopeQuery;
  }>(
    "/participants/:id",
    { schema: updateParticipantRouteSchema },
    async (req, reply) => {
      const scoped = await resolveScopeOrReply(deps, req.query, reply);
      if (scoped === null) return;
      try {
        return await updateParticipant(scoped.paths, req.params.id, {
          name: req.body.name,
          color: req.body.color,
          avatar_preset: req.body.avatar_preset,
        });
      } catch (err) {
        const message = errorMessage(err);
        reply.code(/not found/i.test(message) ? 404 : 400);
        return { error: message };
      }
    },
  );
}

async function resolveScopeOrReply(
  deps: ParticipantRouteDeps,
  query: ScopeQuery,
  reply: FastifyReply,
): Promise<Extract<ParticipantScopeResult, { ok: true }> | null> {
  const scoped = await resolveParticipantScope(deps, query);
  if (scoped.ok) return scoped;
  reply.code(scoped.status);
  reply.send(scoped.body);
  return null;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
