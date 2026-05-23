import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Paths } from "../paths.js";
import type { TmuxManager } from "../tmux/manager.js";
import type { PresenceTracker } from "../presence/tracker.js";
import { registerAgent, isValidParticipantId } from "../participants.js";
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
}

const CONFIRM_TTL_MS = 10_000;

interface ConfirmEntry {
  token: string;
  exp: number;
}

export function registerManagedAgentsRoutes(
  app: FastifyInstance,
  deps: ManagedAgentsDeps,
): void {
  const { paths, tmux, tracker } = deps;

  // Per-registration confirm-token map so multiple Fastify instances in the
  // same process (e.g. parallel test apps) cannot share or stomp on each
  // other's tokens.
  const confirmTokens = new Map<string, ConfirmEntry>();

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
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("already registered")) {
        reply.code(400);
        return { error: msg };
      }
      // Reuse existing participant
    }
    const { sessionName } = await tmux.spawnAgent({
      participantId,
      executable: runtime.executable,
      args: runtime.args,
      env: runtime.env,
    });
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
    return {
      participant_id: participantId,
      tmux_session: sessionName,
      runtime_id,
      hooks_status: "unknown" as const,
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
    return { tmux_session: sessionName, label, index };
  });

  app.get("/managed-agents", async () => {
    const sessions = await tmux.listFmarkSessions();
    const agentIds = await listManagedAgentIds(paths.fmarkDir());
    const agents: Array<{
      participant_id: string;
      tmux_session: string | null;
      runtime_id: string | null;
    }> = [];
    for (const aid of agentIds) {
      const tmuxSession = await readTmuxSession(paths.fmarkDir(), aid);
      const runtimeId = await readRuntime(paths.fmarkDir(), aid);
      agents.push({
        participant_id: aid,
        tmux_session: tmuxSession,
        runtime_id: runtimeId,
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
}
