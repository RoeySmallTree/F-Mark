import type { FastifyInstance } from "fastify";
import type { AnyEventRecord, EventKind } from "@f-mark/shared";
import { paths as makePaths, type Paths } from "../paths.js";
import { createSession, listSessions } from "../sessions.js";
import {
  ensureDefaultUserParticipant,
  listParticipants,
  type ParticipantWithSession,
} from "../participants.js";
import type { PathContextRef } from "../paths/contextRef.js";
import { activePaths } from "../paths/active.js";
import { computePathId } from "../paths/identity.js";
import {
  listRegisteredProjectPaths,
  registerProjectPath,
} from "../paths/registry.js";
import { validateWritableDirectory } from "./fs.js";
import {
  bumpRevision,
  mruPush,
  readState,
  updateState,
} from "../state/store.js";
import { readEvents } from "../events/reader.js";

interface CreateBody {
  slug?: string;
  /** Absolute path to the parent folder. When present, the session is created
      under <path>/.f-mark/sessions/<id>/ and activePath is set to <path>.
      When absent, falls back to the active path (or the injected fallback
      paths for tests that don't wire the multi-path context). */
  path?: string;
}

interface ListQuery {
  scope?: string;
}

interface EventsQuery {
  scope?: string;
  kinds?: string;
}

type SessionWithPath = Awaited<ReturnType<typeof listSessions>>[number] & {
  path: string;
  path_id: string;
};

interface SessionEventsGroup {
  path: string;
  path_id: string;
  session: SessionWithPath;
  events: AnyEventRecord[];
  participants: Record<string, ParticipantWithSession>;
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

function pushUnique(
  out: string[],
  seen: Set<string>,
  path: string | null,
): void {
  if (path === null || seen.has(path)) return;
  seen.add(path);
  out.push(path);
}

async function listSessionsAcrossPaths(
  deps: SessionRouteDeps,
): Promise<SessionWithPath[]> {
  const seen = new Set<string>();
  const roots: string[] = [];

  if (deps.ref) {
    const ctx = deps.ref.get();
    const state = await readState(deps.ref.global());
    pushUnique(roots, seen, ctx.active?.root() ?? null);
    pushUnique(roots, seen, state.activePath);
    for (const path of state.knownPaths) pushUnique(roots, seen, path);
    for (const favorite of state.favorites) {
      pushUnique(roots, seen, favorite.path);
    }
    for (const path of await listRegisteredProjectPaths(deps.ref.global())) {
      pushUnique(roots, seen, path);
    }
  }

  pushUnique(roots, seen, deps.fallback.root());

  const sessions: SessionWithPath[] = [];
  for (const root of roots) {
    let list: Awaited<ReturnType<typeof listSessions>>;
    try {
      list = await listSessions(makePaths(root));
    } catch {
      continue;
    }
    if (list.length === 0) continue;
    let pathId: string;
    try {
      pathId = computePathId(root);
    } catch {
      continue;
    }
    for (const session of list) {
      sessions.push({ ...session, path: root, path_id: pathId });
    }
  }
  sessions.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return sessions;
}

export function registerSessionRoutes(
  app: FastifyInstance,
  pOrDeps: Paths | SessionRouteDeps,
): void {
  const deps: SessionRouteDeps =
    "fallback" in pOrDeps ? pOrDeps : { fallback: pOrDeps };

  app.get<{ Querystring: ListQuery }>("/sessions", async (req) => {
    if (req.query.scope === "all") {
      return { sessions: await listSessionsAcrossPaths(deps) };
    }
    return { sessions: await listSessions(resolveListPaths(deps)) };
  });

  app.get<{ Querystring: EventsQuery }>("/sessions/events", async (req) => {
    const kinds = req.query.kinds
      ?.split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0) as EventKind[] | undefined;

    const sessions =
      req.query.scope === "all"
        ? await listSessionsAcrossPaths(deps)
        : (await listSessions(resolveListPaths(deps))).map((session) => {
            const p = resolveListPaths(deps);
            return {
              ...session,
              path: p.root(),
              path_id: computePathId(p.root()),
            };
          });

    const participantsByPath = new Map<
      string,
      Record<string, ParticipantWithSession>
    >();
    const groups: SessionEventsGroup[] = [];
    for (const session of sessions) {
      const p = makePaths(session.path);
      let participants = participantsByPath.get(session.path);
      if (participants === undefined) {
        try {
          participants = await listParticipants(p);
        } catch {
          participants = {};
        }
        participantsByPath.set(session.path, participants);
      }
      let events: AnyEventRecord[];
      try {
        events = await readEvents(p, session.id, { kinds });
      } catch {
        events = [];
      }
      groups.push({
        path: session.path,
        path_id: session.path_id,
        session,
        events,
        participants,
      });
    }
    return { groups };
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
          const next = await updateState(deps.ref.global(), (s) =>
            bumpRevision(
              mruPush(
                { ...s, activePath: validated.canonical },
                validated.canonical,
              ),
            ),
          );
          await registerProjectPath(deps.ref.global(), validated.canonical);
          deps.ref.setActive(activePaths(validated.canonical));
          deps.ref.setRevision(next.activeRevision);
        }
      } else {
        p = resolveListPaths(deps);
      }

      try {
        await ensureDefaultUserParticipant(p);
        const session = await createSession(p, { slug: body.slug });
        if (
          deps.ref &&
          !(typeof body.path === "string" && body.path.length > 0)
        ) {
          await updateState(deps.ref.global(), (s) => mruPush(s, p.root()));
        }
        if (deps.ref) {
          await registerProjectPath(deps.ref.global(), p.root());
        }
        return {
          ...session,
          path: p.root(),
          path_id: computePathId(p.root()),
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.code(400);
        return { error: message };
      }
    },
  );
}
