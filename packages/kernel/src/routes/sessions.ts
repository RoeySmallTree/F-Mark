import type { FastifyInstance } from "fastify";
import type {
  AnyEventRecord,
  CreateSessionRequest,
  EventKind,
  ForkedAgentResult,
  ForkSessionRequest,
  ForkSessionResponse,
  SessionEventGroup,
  SessionWithPath,
  UpdateSessionRequest,
} from "@f-mark/shared";
import { paths as makePaths, type Paths } from "../paths.js";
import {
  createSession,
  deleteSession,
  forkSessionFolder,
  listSessions,
  renameSession,
} from "../sessions.js";
import {
  ensureDefaultUserParticipant,
  ensureSystemForkParticipant,
  listParticipants,
  type ParticipantWithSession,
} from "../participants.js";
import { writeForkLinkPair } from "../services/forkLinkWriter.js";
import { isoTimestamp } from "@f-mark/shared";
import { initProject, readConfig } from "../project.js";
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
import type { TmuxManager } from "../tmux/manager.js";
import { createAgentStateStore } from "../services/agentState.js";
import type { Bus } from "../ws/bus.js";
import { ensureProjectAuth } from "../auth.js";

interface ListQuery {
  scope?: string;
}

interface EventsQuery {
  scope?: string;
  kinds?: string;
}

interface PathQuery {
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
  /** Optional tmux manager getter. POST /sessions with a `path` activates
      that path; when process spawning is enabled, new managed spawns must
      bind to the same freshly-active root. */
  getTmuxManager?: () => TmuxManager | null;
  token?: string | null;
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

async function initSessionProject(deps: SessionRouteDeps, p: Paths): Promise<void> {
  let port: number | undefined;
  try {
    port = (await readConfig(deps.fallback)).port;
  } catch {
    // Keep initProject's default when the fallback config is unavailable.
  }
  if (port === undefined) {
    await initProject(p);
  } else {
    await initProject(p, port);
  }
  await ensureProjectAuth(p, deps.token ?? null);
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
  getBus?: () => Bus,
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
    const groups: SessionEventGroup[] = [];
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

  app.post<{ Body: CreateSessionRequest }>(
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
          deps.getTmuxManager?.()?.rebind({
            projectRoot: validated.canonical,
          });
        }
      } else {
        p = resolveListPaths(deps);
      }

      try {
        await initSessionProject(deps, p);
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

  app.patch<{
    Params: { id: string };
    Body: UpdateSessionRequest;
  }>(
    "/sessions/:id",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", minLength: 1 } },
        },
        body: {
          type: "object",
          required: ["slug"],
          additionalProperties: false,
          properties: {
            slug: { type: "string", minLength: 1 },
            path: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      const body = req.body;
      const p =
        typeof body.path === "string" && body.path.length > 0
          ? makePaths(body.path)
          : resolveListPaths(deps);
      try {
        const session = await renameSession(
          p,
          decodeURIComponent(req.params.id),
          { slug: body.slug },
        );
        return {
          ...session,
          path: p.root(),
          path_id: computePathId(p.root()),
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.code(/not found/i.test(message) ? 404 : 400);
        return { error: message };
      }
    },
  );

  app.delete<{
    Params: { id: string };
    Querystring: PathQuery;
  }>("/sessions/:id", async (req, reply) => {
    const p =
      typeof req.query.path === "string" && req.query.path.length > 0
        ? makePaths(req.query.path)
        : resolveListPaths(deps);
    try {
      await deleteSession(p, decodeURIComponent(req.params.id));
      reply.code(204);
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      reply.code(/not found/i.test(message) ? 404 : 400);
      return { error: message };
    }
  });

  app.post<{
    Params: { id: string };
    Body: ForkSessionRequest;
  }>(
    "/sessions/:id/fork",
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
            path: { type: "string" },
            name: { type: "string" },
            relaunch_agents: { type: "boolean" },
            agent_ids: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
    async (req, reply): Promise<ForkSessionResponse | { error: string }> => {
      const sourceSessionId = decodeURIComponent(req.params.id);
      const body = req.body ?? {};
      let p: Paths;

      if (typeof body.path === "string" && body.path.length > 0) {
        const validated = await validateWritableDirectory(body.path);
        if (!validated.ok) {
          reply.code(validated.status);
          return { error: validated.body.message };
        }
        p = makePaths(validated.canonical);
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
          deps.getTmuxManager?.()?.rebind({
            projectRoot: validated.canonical,
          });
        }
      } else {
        p = resolveListPaths(deps);
      }

      const agentState = createAgentStateStore(deps);
      let participants: Record<string, ParticipantWithSession>;
      try {
        participants = await listParticipants(p, { agentState });
      } catch {
        participants = {};
      }
      const requestedAgentIds =
        Array.isArray(body.agent_ids) && body.agent_ids.length > 0
          ? body.agent_ids
          : Object.entries(participants)
              .filter(([, participant]) => participant.active_session === sourceSessionId)
              .map(([id]) => id);
      const shouldRelaunch = body.relaunch_agents !== false;

      try {
        // Preflight: ensure the system "Fork" participant exists before the
        // fork-link writes so the most likely avoidable failure mode is gone.
        await ensureSystemForkParticipant(p);
        const forkInstantTs = isoTimestamp();
        const fork = await forkSessionFolder(p, {
          sourceSessionId,
          name: body.name,
          agentParticipantIds: requestedAgentIds,
        });
        if (deps.ref) {
          await updateState(deps.ref.global(), (s) => mruPush(s, p.root()));
          await registerProjectPath(deps.ref.global(), p.root());
        }

        // Derive source slug the same way forkSessionFolder does.
        const sourceSlug = sourceSessionId.replace(/^\d{4}-\d{2}-\d{2}-/, "");
        const linkResults = await writeForkLinkPair({
          p,
          sourceSessionId,
          forkSessionId: fork.session.id,
          sourceSlug,
          forkSlug: fork.session.slug,
          timestamp: forkInstantTs,
          bus: getBus?.() ?? null,
        });
        const linkWarnings: string[] = [];
        if ("error" in linkResults.source) {
          linkWarnings.push(
            `source fork-link write failed: ${linkResults.source.error}`,
          );
        }
        if ("error" in linkResults.fork) {
          linkWarnings.push(
            `fork fork-link write failed: ${linkResults.fork.error}`,
          );
        }

        const agents = shouldRelaunch
          ? await describeForkAgentDuplication({
              p,
              sourceSessionId,
              forkSessionId: fork.session.id,
              participantIds: requestedAgentIds,
              participants,
              agentState,
              tmux: deps.getTmuxManager?.() ?? null,
            })
          : requestedAgentIds.map((participantId): ForkedAgentResult => {
              const participant = participants[participantId];
              return {
                participant_id: participantId,
                runtime_id: participant?.runtime_id ?? null,
                display_name: participant?.name ?? participantId,
                status: "skipped-detached",
                warning: "agent relaunch disabled for this fork request",
              };
            });
        const warnings = [
          ...agents
            .map((agent) => agent.warning)
            .filter((warning): warning is string => warning !== undefined),
          ...linkWarnings,
        ];
        const session = {
          ...fork.session,
          path: p.root(),
          path_id: computePathId(p.root()),
        };
        const bus = getBus?.();
        bus?.publish({
          type: "session.forked",
          source_session_id: sourceSessionId,
          session,
          agents,
          warnings,
        });
        return {
          source_session_id: sourceSessionId,
          session,
          copied_entries: fork.copied_entries,
          agents,
          warnings,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.code(/not found/i.test(message) ? 404 : 400);
        return { error: message };
      }
    },
  );
}

async function describeForkAgentDuplication(input: {
  p: Paths;
  sourceSessionId: string;
  forkSessionId: string;
  participantIds: string[];
  participants: Record<string, ParticipantWithSession>;
  agentState: ReturnType<typeof createAgentStateStore>;
  tmux: TmuxManager | null;
}): Promise<ForkedAgentResult[]> {
  const managedIds = new Set(await input.agentState.listManagedAgentIds());
  const liveSessions = new Set(
    input.tmux !== null
      ? (await input.tmux.listFmarkSessions()).map((session) => session.sessionName)
      : [],
  );
  const out: ForkedAgentResult[] = [];
  for (const participantId of input.participantIds) {
    const participant = input.participants[participantId];
    if (participant === undefined || participant.kind !== "agent") {
      out.push({
        participant_id: participantId,
        runtime_id: null,
        display_name: participantId,
        status: "failed",
        warning: "agent participant not found",
      });
      continue;
    }
    const runtimeId =
      participant.runtime_id ?? (await input.agentState.readRuntime(participantId));
    const tmuxSession = await input.agentState.readTmuxSession(participantId);
    const control = await input.agentState.readControlState(participantId);
    if (participant.active_session !== input.sourceSessionId) {
      out.push({
        participant_id: participantId,
        runtime_id: runtimeId,
        display_name: participant.name,
        status: "skipped-detached",
        tmux_session: tmuxSession,
        warning: "agent is not linked to the source session",
      });
      continue;
    }
    if (control.paused) {
      out.push({
        participant_id: participantId,
        runtime_id: runtimeId,
        display_name: participant.name,
        status: "skipped-paused",
        tmux_session: tmuxSession,
      });
      continue;
    }
    if (
      !managedIds.has(participantId) ||
      tmuxSession === null ||
      !liveSessions.has(tmuxSession)
    ) {
      out.push({
        participant_id: participantId,
        runtime_id: runtimeId,
        display_name: participant.name,
        status: "skipped-detached",
        tmux_session: tmuxSession,
        warning: "agent pane is not connected",
      });
      continue;
    }
    await input.agentState.appendLog(participantId, {
      event: "fork-duplicate-skipped",
      source_session: input.sourceSessionId,
      fork_session: input.forkSessionId,
    });
    out.push({
      participant_id: participantId,
      runtime_id: runtimeId,
      display_name: participant.name,
      status: "skipped-unsupported",
      tmux_session: tmuxSession,
      native_command: null,
      warning:
        "agent duplication for forked sessions is not implemented; source agent was left attached to the source session",
    });
  }
  return out;
}
