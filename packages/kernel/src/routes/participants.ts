import type { FastifyInstance } from "fastify";
import { paths as makePaths, type Paths } from "../paths.js";
import type { PathContextRef } from "../paths/contextRef.js";
import {
  listParticipants,
  registerAgent,
  updateParticipant,
} from "../participants.js";

interface RegisterBody {
  kind: "agent";
  name?: string;
  suggested_id?: string;
}

interface UpdateParams {
  id: string;
}

interface UpdateBody {
  name?: string;
  color?: string;
}

export interface ParticipantRouteDeps {
  /** Fallback Paths used when no multi-path ref is wired (e.g., existing
      tests that pass a plain Paths object). */
  fallback: Paths;
  /** Optional multi-path ref. When provided and ref.active is set, the
      route reads/writes participants from the active path's .f-mark/
      instead of the fallback. */
  ref?: PathContextRef;
}

function resolvePaths(deps: ParticipantRouteDeps): Paths {
  if (deps.ref) {
    const active = deps.ref.get().active;
    if (active !== null) return makePaths(active.root());
  }
  return deps.fallback;
}

export function registerParticipantRoutes(
  app: FastifyInstance,
  pOrDeps: Paths | ParticipantRouteDeps,
): void {
  const deps: ParticipantRouteDeps =
    "fallback" in pOrDeps ? pOrDeps : { fallback: pOrDeps };

  app.get("/participants", async () => {
    try {
      return { participants: await listParticipants(resolvePaths(deps)) };
    } catch (err) {
      /* Active path may not have a .f-mark/ yet — e.g., user just picked a
         fresh folder via PathSwitcher but hasn't created a session. Show
         an empty roster rather than 500-ing the renderer's bootstrap. */
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return { participants: {} };
      }
      throw err;
    }
  });

  app.post<{ Body: RegisterBody }>(
    "/participants/register",
    {
      schema: {
        body: {
          type: "object",
          required: ["kind", "name"],
          properties: {
            kind: { type: "string", enum: ["agent"] },
            name: { type: "string", minLength: 1, maxLength: 60 },
            suggested_id: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      try {
        const created = await registerAgent(resolvePaths(deps), {
          name: req.body.name!,
          suggested_id: req.body.suggested_id,
        });
        return created;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.code(400);
        return { error: message };
      }
    },
  );

  app.patch<{ Params: UpdateParams; Body: UpdateBody }>(
    "/participants/:id",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", minLength: 1 } },
        },
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string", minLength: 1, maxLength: 60 },
            color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
          },
        },
      },
    },
    async (req, reply) => {
      try {
        const updated = await updateParticipant(resolvePaths(deps), req.params.id, {
          name: req.body.name,
          color: req.body.color,
        });
        return updated;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const status = /not found/i.test(message) ? 404 : 400;
        reply.code(status);
        return { error: message };
      }
    },
  );
}
