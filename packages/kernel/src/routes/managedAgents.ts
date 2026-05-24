import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Paths } from "../paths.js";
import type { TmuxManager } from "../tmux/manager.js";
import type { PresenceTracker } from "../presence/tracker.js";
import {
  registerAgent,
  isValidParticipantId,
  listParticipants,
  setParticipantRuntime,
} from "../participants.js";
import { loadRuntimes } from "../runtimes/registry.js";
import {
  writeTmuxSession,
  readTmuxSession,
  writeRuntime,
  readRuntime,
  clearManagedSiblings,
  listManagedAgentIds,
} from "../agents/managed.js";
import { writeActiveSession } from "../agents/activeSession.js";
import { appendAgentLog, readAgentLog } from "../agents/logs.js";
import type { InputQueue } from "../tmux/inputQueue.js";
import { validateSlashCommand, validateMessageText } from "../runtimes/validation.js";
import { checkHookInstallStatus as defaultCheckHookInstallStatus } from "../hooksInstall/index.js";
import type { Bus } from "../ws/bus.js";

interface SpawnBody {
  runtime_id?: string;
  session_id?: string;
  name?: string;
  suggested_participant_id?: string;
}

interface TerminalBody {
  name?: string;
}

export interface ManagedAgentsDeps {
  paths: Paths;
  tmux: TmuxManager;
  tracker: PresenceTracker;
  projectRoot: string;
  /**
   * Shared per-pane input queue. Lifted to server scope (createServer)
   * so both `registerManagedAgentsRoutes` and `registerPaneWebSocket`
   * enqueue tmux sends against the same queue object, preventing byte-
   * level interleaving between kernel-injected slash commands and
   * overlay-typed WS input.
   */
  inputQueue: InputQueue;
  /**
   * Broadcast bus for managed-agent WS messages. Used to publish
   * `managed-agent.spawned`, `managed-agent.killed`, and
   * `managed-agent.terminal-spawned` after successful route operations,
   * so the renderer can update chip state without a manual list refresh.
   */
  bus: Bus;
  /**
   * Optional override for the hook-install detection used by the spawn
   * route. Defaults to the production `checkHookInstallStatus`; tests inject
   * a fake to drive the kickoff send-keys path without touching real config
   * files.
   */
  checkHookInstallStatus?: typeof defaultCheckHookInstallStatus;
}

const CONFIRM_TTL_MS = 10_000;

interface ConfirmEntry {
  token: string;
  exp: number;
}

/**
 * Cookie-auth Origin/Host gate for mutating /managed-agents/* routes.
 *
 * Defence-in-depth per the v0.4 Security spec: any cookie-authenticated
 * mutating request must carry an `Origin` header whose host resolves to
 * `localhost`, `127.0.0.1`, or matches the request's own `Host` header.
 *
 * Bearer-authenticated requests (`Authorization: Bearer …`) bypass the check,
 * because the bearer token is not silently sent by browsers across origins.
 * GETs are unaffected.
 */
function makeManagedAgentsOriginHook(): (
  req: import("fastify").FastifyRequest,
  reply: import("fastify").FastifyReply,
) => Promise<void> {
  return async (req, reply) => {
    // Only scope this hook to /managed-agents/* URLs. We register globally
    // (Fastify hooks bubble), so we have to gate by prefix ourselves.
    if (!req.url.startsWith("/managed-agents")) return;
    if (req.method === "GET") return; // read-only routes never gated
    const hasHeader = req.headers.authorization !== undefined;
    if (hasHeader) return; // bearer auth — skip
    const cookieHeader = req.headers.cookie ?? "";
    const hasCookie = cookieHeader.includes("fmark_token=");
    if (!hasCookie) return; // no auth at all → upstream auth gate will 401
    const origin = req.headers.origin;
    if (typeof origin !== "string" || origin.length === 0) {
      reply
        .code(403)
        .send({ error: "cookie-authenticated request missing Origin header" });
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      reply.code(403).send({ error: `invalid Origin header: ${origin}` });
      return;
    }
    const host = parsed.hostname;
    const rawHost = (req.headers.host ?? "").toString();
    // host header is "name[:port]" — strip port for comparison.
    const reqHost = rawHost.split(":")[0] ?? "";
    if (host !== "localhost" && host !== "127.0.0.1" && host !== reqHost) {
      reply.code(403).send({ error: `Origin ${origin} not allowed` });
      return;
    }
  };
}

export function registerManagedAgentsRoutes(
  app: FastifyInstance,
  deps: ManagedAgentsDeps,
): void {
  const { paths, tmux, tracker, inputQueue, bus } = deps;
  const hookStatusCheck = deps.checkHookInstallStatus ?? defaultCheckHookInstallStatus;

  // Defence-in-depth: gate cookie-authenticated mutating requests by Origin.
  // Registered before the routes so it runs on every /managed-agents/* call.
  app.addHook("preHandler", makeManagedAgentsOriginHook());

  // Per-registration confirm-token map so multiple Fastify instances in the
  // same process (e.g. parallel test apps) cannot share or stomp on each
  // other's tokens.
  const confirmTokens = new Map<string, ConfirmEntry>();

  // `inputQueue` is the per-pane queue *shared* with /ws/pane (created in
  // createServer). All tmux sends from this module enqueue against the
  // agent's tmux-session as the pane key, so kernel-injected commands and
  // overlay-typed WS input cannot interleave at the tmux byte level.

  function mintConfirm(id: string): string {
    const token = randomBytes(8).toString("hex");
    confirmTokens.set(id, { token, exp: Date.now() + CONFIRM_TTL_MS });
    return token;
  }

  function consumeConfirm(id: string, token: string): boolean {
    const entry = confirmTokens.get(id);
    if (!entry) return false;
    if (Date.now() > entry.exp) {
      confirmTokens.delete(id);
      return false;
    }
    if (entry.token !== token) return false;
    confirmTokens.delete(id);
    return true;
  }

  app.post<{ Body: SpawnBody }>("/managed-agents/spawn", async (req, reply) => {
    const body = (req.body ?? {}) as SpawnBody;
    const runtime_id = body.runtime_id;
    if (typeof runtime_id !== "string" || runtime_id.length === 0) {
      reply.code(400);
      return { error: "runtime_id required" };
    }
    let runtimes;
    try {
      runtimes = await loadRuntimes(paths.fmarkDir());
    } catch {
      reply.code(500);
      return { error: "failed to load runtimes" };
    }
    const runtime = runtimes.runtimes[runtime_id];
    if (!runtime) {
      reply.code(400);
      return { error: `unknown runtime_id: ${runtime_id}` };
    }
    const participantId =
      body.suggested_participant_id ??
      `ag-${runtime_id.slice(0, 8)}-${randomBytes(2).toString("hex")}`;
    if (!isValidParticipantId(participantId)) {
      reply.code(400);
      return { error: "invalid participant_id" };
    }
    try {
      await registerAgent(paths, {
        name: body.name ?? runtime.displayName,
        suggested_id: participantId,
        runtime_id,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("already registered")) {
        reply.code(400);
        return { error: msg };
      }
      // Reuse existing participant — backfill runtime_id in case it was
      // registered before the field existed or under a different runtime.
      await setParticipantRuntime(paths, participantId, runtime_id);
    }
    const { sessionName } = await tmux.spawnAgent({
      participantId,
      executable: runtime.executable,
      args: runtime.args,
      env: runtime.env,
    });
    // After a successful tmux spawn we have external state (the tmux session).
    // If any subsequent write fails the route would otherwise return 500 and
    // leave an orphan tmux session behind. Roll back by killing the session
    // before re-raising.
    try {
      await writeTmuxSession(paths.fmarkDir(), participantId, sessionName);
      await writeRuntime(paths.fmarkDir(), participantId, runtime_id);
      if (body.session_id !== undefined) {
        await writeActiveSession(paths.fmarkDir(), participantId, body.session_id);
      }
      // v0.4: optimistic paneAlive — the presence ticker / pane-died detection
      // happens elsewhere. We pass a closure that returns true so the tracker
      // bucket exists; downstream code can replace this when it has authoritative
      // pane state.
      tracker.setManagedPane(participantId, { paneAlive: () => true });
      await appendAgentLog(paths.fmarkDir(), participantId, {
        event: "spawn",
        runtime: runtime_id,
        tmux_session: sessionName,
      });
    } catch (err) {
      try {
        await tmux.killSession(sessionName);
      } catch {
        // best-effort cleanup; surface the original write failure
      }
      throw err;
    }

    // Hook install detection + presence seeding. Best-effort: if the runtime
    // is unknown to the detector (or the detector throws on a transient IO
    // error), fall back to "unknown" rather than failing the whole spawn.
    let hooksStatus: "installed" | "missing" | "not_required" | "unknown" =
      "unknown";
    try {
      // Find the first registered user participant so the detector matches the
      // exact `auto-stream <user-id> --kind user` UserPromptSubmit hook the
      // installer instructions emit. Without this match, real installed hooks
      // would still be reported "missing".
      let userParticipantId: string | undefined;
      try {
        const parts = await listParticipants(paths);
        for (const [pid, part] of Object.entries(parts)) {
          if (part.kind === "user") {
            userParticipantId = pid;
            break;
          }
        }
      } catch {
        // ignore; checkHookInstallStatus has its own default
      }
      const detect = await hookStatusCheck({
        runtimeId: runtime_id,
        participantId,
        userParticipantId,
        projectRoot: paths.root(),
      });
      const hooksRequired = detect.expectedEntries.length > 0;
      if (detect.installed) {
        tracker.setManagedHookStatus(participantId, true);
        hooksStatus = "installed";
      } else if (hooksRequired) {
        tracker.setManagedHookStatus(participantId, false);
        hooksStatus = "missing";
      } else {
        tracker.markReconciledStale(participantId, { paneAlive: () => true });
        hooksStatus = "not_required";
      }

      // When hooks are already installed, deliver a brief kickoff prompt to
      // the freshly-spawned runtime via send-keys. The spec calls for the full
      // /guide markdown here, but for v0.4 a concise welcome that includes the
      // participant id, optional session, and the AGENT.md pointer is enough
      // to satisfy the "one-click agent spinup" goal. Sent through the shared
      // input queue so it cannot interleave with overlay-typed input.
      if (detect.installed) {
        const sessionHint =
          body.session_id !== undefined ? `, session ${body.session_id}` : "";
        const kickoff = `Welcome — you are participant ${participantId}${sessionHint}. Use the F-Mark API as documented in .f-mark/AGENT.md.`;
        const readyDelayMs = runtime.readyDelayMs ?? 0;
        const fire = async (): Promise<void> => {
          await inputQueue.enqueue(sessionName, async () => {
            await tmux.sendLiteralText(sessionName, kickoff);
            await tmux.sendKey(sessionName, "C-m");
          });
        };
        if (readyDelayMs > 0) {
          // Defer the send until the runtime is likely listening on stdin.
          // The route response returns promptly; the kickoff is queued via the
          // shared per-pane input queue so it cannot interleave with WS input.
          setTimeout(() => {
            void fire().catch(() => {
              /* best-effort */
            });
          }, readyDelayMs).unref?.();
        } else {
          await fire();
        }
      }
    } catch {
      // Detection failed — leave status "unknown" and presence untouched.
    }

    // active-session was written above when body.session_id was provided;
    // surface it on the response + broadcast so the renderer can scope the
    // chip strip to the current session without a /participants refetch.
    const activeSession = body.session_id ?? null;

    // Publish managed-agent.spawned for the renderer chip strip.
    bus.publish({
      type: "managed-agent.spawned",
      participant_id: participantId,
      tmux_session: sessionName,
      runtime_id,
      active_session: activeSession,
    });

    return {
      participant_id: participantId,
      tmux_session: sessionName,
      runtime_id,
      active_session: activeSession,
      hooks_status: hooksStatus,
    };
  });

  app.get<{ Params: { id: string } }>(
    "/managed-agents/:id/confirm-token",
    async (req, reply) => {
      const id = decodeURIComponent(req.params.id);
      if (!isValidParticipantId(id)) {
        reply.code(400);
        return { error: "invalid id" };
      }
      return { token: mintConfirm(id) };
    },
  );

  app.delete<{ Params: { id: string }; Querystring: { confirm?: string } }>(
    "/managed-agents/:id",
    async (req, reply) => {
      const id = decodeURIComponent(req.params.id);
      if (!isValidParticipantId(id)) {
        reply.code(400);
        return { error: "invalid id" };
      }
      const confirm = req.query.confirm;
      if (!confirm || !consumeConfirm(id, confirm)) {
        reply.code(403);
        return { error: "missing or stale confirm token" };
      }
      const session = await readTmuxSession(paths.fmarkDir(), id);
      if (session) {
        try {
          await tmux.killSession(session);
        } catch {
          // tolerate already-dead session — the goal is to clear state
        }
      }
      await clearManagedSiblings(paths.fmarkDir(), id);
      tracker.clearManagedPane(id);
      await appendAgentLog(paths.fmarkDir(), id, { event: "goodbye" });
      bus.publish({ type: "managed-agent.killed", participant_id: id });
      return { ok: true };
    },
  );

  app.post<{ Body: TerminalBody }>("/managed-agents/terminal", async (req) => {
    const sessions = await tmux.listFmarkSessions();
    const existing = sessions.filter((s) => s.kind === "terminal");
    const maxIdx = existing.reduce((m, s) => Math.max(m, s.index ?? 0), 0);
    const index = maxIdx + 1;
    const { sessionName } = await tmux.spawnTerminal({ index });
    const name = req.body?.name;
    const label = typeof name === "string" && name.length > 0 ? name : `terminal ${index}`;
    bus.publish({
      type: "managed-agent.terminal-spawned",
      tmux_session: sessionName,
      label,
    });
    return { tmux_session: sessionName, label, index };
  });

  app.get("/managed-agents", async () => {
    const sessions = await tmux.listFmarkSessions();
    const liveSessionNames = new Set(sessions.map((s) => s.sessionName));
    const agentIds = await listManagedAgentIds(paths.fmarkDir());
    const agents: Array<{
      participant_id: string;
      tmux_session: string | null;
      runtime_id: string | null;
      alive: boolean;
    }> = [];
    for (const aid of agentIds) {
      const tmuxSession = await readTmuxSession(paths.fmarkDir(), aid);
      const runtimeId = await readRuntime(paths.fmarkDir(), aid);
      // alive iff the recorded tmux session is in the live-sessions set.
      // Stale agent directories (session died, files left behind) are still
      // surfaced — the UI can use alive=false to offer "Reconnect" or cleanup.
      const alive = tmuxSession !== null && liveSessionNames.has(tmuxSession);
      agents.push({
        participant_id: aid,
        tmux_session: tmuxSession,
        runtime_id: runtimeId,
        alive,
      });
    }
    const terminals = sessions
      .filter((s) => s.kind === "terminal")
      .map((s) => ({
        tmux_session: s.sessionName,
        label: `terminal ${s.index}`,
        index: s.index,
      }));
    return { agents, terminals };
  });

  app.get<{ Params: { id: string }; Querystring: { since?: string } }>(
    "/managed-agents/:id/logs",
    async (req, reply) => {
      const id = decodeURIComponent(req.params.id);
      if (!isValidParticipantId(id)) {
        reply.code(400);
        return { error: "invalid id" };
      }
      const limitRaw = req.query.since;
      const limit = limitRaw !== undefined ? Number(limitRaw) : 50;
      const entries = await readAgentLog(paths.fmarkDir(), id, { limit });
      return { entries };
    },
  );

  app.post<{
    Params: { id: string };
    Body: { type?: string; command?: string; text?: string };
  }>("/managed-agents/:id/command", async (req, reply) => {
    const id = decodeURIComponent(req.params.id);
    if (!isValidParticipantId(id)) {
      reply.code(400);
      return { error: "invalid id" };
    }
    const session = await readTmuxSession(paths.fmarkDir(), id);
    if (!session) {
      reply.code(409);
      return { reason: "unmanaged_pane", offer: "open_overlay" };
    }
    const body = (req.body ?? {}) as {
      type?: string;
      command?: string;
      text?: string;
    };
    try {
      if (body.type === "interrupt") {
        await inputQueue.enqueue(session, () => tmux.sendKey(session, "C-c"));
      } else if (body.type === "slash") {
        if (typeof body.command !== "string") {
          reply.code(400);
          return { error: "missing command" };
        }
        validateSlashCommand(body.command);
        const cmd = body.command;
        await inputQueue.enqueue(session, async () => {
          await tmux.sendLiteralText(session, "/" + cmd);
          await tmux.sendKey(session, "C-m");
        });
      } else if (body.type === "message") {
        if (typeof body.text !== "string") {
          reply.code(400);
          return { error: "missing text" };
        }
        validateMessageText(body.text);
        const text = body.text;
        await inputQueue.enqueue(session, async () => {
          await tmux.sendLiteralText(session, text);
          await tmux.sendKey(session, "C-m");
        });
      } else {
        reply.code(400);
        return { error: "unknown command type" };
      }
      await appendAgentLog(paths.fmarkDir(), id, {
        event: "command",
        type: body.type,
      });
      return { ok: true };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      reply.code(400);
      return { error: msg };
    }
  });
}
