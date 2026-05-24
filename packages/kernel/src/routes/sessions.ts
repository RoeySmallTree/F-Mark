import type { FastifyInstance } from "fastify";
import { paths as makePaths, type Paths } from "../paths.js";
import { createSession, listSessions } from "../sessions.js";
import type { PathContextRef } from "../paths/contextRef.js";
import { activePaths } from "../paths/active.js";
import { validateWritableDirectory } from "./fs.js";
import { bumpRevision, mruPush, updateState } from "../state/store.js";

interface CreateBody {
  slug?: string;
  /** Absolute path to the parent folder. When present, the session is created
      under <path>/.f-mark/sessions/<id>/ and activePath is set to <path>.
      When absent, falls back to the active path (or the injected fallback
      paths for tests that don't wire the multi-path context). */
  path?: string;
}

export interface SessionRouteDeps {
  /** Fallback paths used when the multi-path ref is absent or has no active
      path. Retained so existing tests that wire only `paths` keep working. */
  fallback: Paths;
  /** Optional multi-path ref. When provided, GET /sessions uses ref.active
      (or `fallback` if active is null), and POST /sessions can accept a
      `path` body field to create + activate. */
  ref?: PathContextRef;
}

function resolveListPaths(deps: SessionRouteDeps): Paths {
  if (deps.ref) {
    const active = deps.ref.get().active;
    if (active !== null) {
      // ActivePaths and Paths share the relevant subset (root/sessionsDir/etc.)
      return makePaths(active.root());
    }
  }
  return deps.fallback;
}

export function registerSessionRoutes(
  app: FastifyInstance,
  pOrDeps: Paths | SessionRouteDeps,
): void {
  const deps: SessionRouteDeps =
    "fallback" in pOrDeps ? pOrDeps : { fallback: pOrDeps };

  app.get("/sessions", async () => {
    return { sessions: await listSessions(resolveListPaths(deps)) };
  });

  app.post<{ Body: CreateBody }>(
    "/sessions",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            slug: { type: "string" },
            path: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      const body = req.body ?? {};
      let p: Paths;

      if (typeof body.path === "string" && body.path.length > 0) {
        const validated = await validateWritableDirectory(body.path);
        if (!validated.ok) {
          reply.code(validated.status);
          return validated.body;
        }
        p = makePaths(validated.canonical);
        // If a ref is wired, activate the chosen path so subsequent GET
        // /sessions returns the new path's sessions. State.json + ref are
        // updated atomically.
        if (deps.ref) {
          await updateState(deps.ref.global(), (s) =>
            bumpRevision(mruPush({ ...s, activePath: validated.canonical }, validated.canonical)),
          );
          deps.ref.setActive(activePaths(validated.canonical));
        }
      } else {
        p = resolveListPaths(deps);
      }

      try {
        return await createSession(p, { slug: body.slug });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.code(400);
        return { error: message };
      }
    },
  );
}
