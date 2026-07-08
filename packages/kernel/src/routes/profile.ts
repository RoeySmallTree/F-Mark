import type { FastifyInstance } from "fastify";
import { type UpdateUserProfilePatch } from "@f-mark/shared";
import { paths as makePaths, type Paths } from "../paths.js";
import type { PathContextRef } from "../paths/contextRef.js";
import type { GlobalPaths } from "../paths/global.js";
import { globalPaths } from "../paths/global.js";
import {
  readUserProfile,
  readUserProfileForProject,
  updateUserProfile,
} from "../userProfile.js";
import { participantProfilePatchBodySchema } from "./participantProfileSchema.js";

export interface ProfileRouteDeps {
  fallback?: Paths;
  global?: GlobalPaths;
  ref?: PathContextRef;
}

function resolveGlobalPaths(deps: ProfileRouteDeps): GlobalPaths {
  return deps.ref?.global() ?? deps.global ?? globalPaths();
}

function resolveProjectPaths(deps: ProfileRouteDeps): Paths | null {
  const active = deps.ref?.get().active;
  if (active !== undefined && active !== null) return makePaths(active.root());
  return deps.fallback ?? null;
}

export function registerProfileRoutes(
  app: FastifyInstance,
  deps: ProfileRouteDeps = {},
): void {
  app.get("/profile", async () => {
    const global = resolveGlobalPaths(deps);
    const project = resolveProjectPaths(deps);
    return {
      profile:
        project === null
          ? await readUserProfile(global)
          : await readUserProfileForProject(global, project),
    };
  });

  app.patch<{ Body: UpdateUserProfilePatch }>(
    "/profile",
    {
      schema: {
        body: participantProfilePatchBodySchema,
      },
    },
    async (req, reply) => {
      try {
        return {
          profile: await updateUserProfile(
            resolveGlobalPaths(deps),
            req.body,
          ),
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.code(400);
        return { error: message };
      }
    },
  );
}
