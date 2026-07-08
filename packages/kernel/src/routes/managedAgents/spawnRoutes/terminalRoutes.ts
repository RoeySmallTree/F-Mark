import type { KillTerminalRequest, SpawnTerminalRequest } from "@f-mark/shared";
import type { FastifyInstance } from "fastify";
import {
  fmarkSessionMatchesProjectRoot,
  parseFmarkSessionName,
} from "../../../tmux/naming.js";
import type { ManagedAgentsRouteContext } from "../routeContext.js";

export function registerTerminalSpawnRoute(
  app: FastifyInstance,
  context: ManagedAgentsRouteContext,
): void {
  app.post<{ Body: SpawnTerminalRequest }>(
    "/managed-agents/terminal",
    async (req) => {
      const projectRoot = context.routePaths().root();
      const sessions = await context.tmux.listFmarkSessions(projectRoot);
      const existing = sessions.filter((s) => s.kind === "terminal");
      const maxIdx = existing.reduce((m, s) => Math.max(m, s.index ?? 0), 0);
      const index = maxIdx + 1;
      const { sessionName } = await context.tmux.spawnTerminal({ index });
      const label = terminalLabel(req.body?.name, index);

      context.bus.publish({
        type: "managed-agent.terminal-spawned",
        tmux_session: sessionName,
        label,
        index,
      });
      return { tmux_session: sessionName, label, index };
    },
  );
}

/**
 * DELETE /managed-agents/terminal — kill a standalone terminal tmux session.
 *
 * Idempotent and ownership-checked: a name that isn't a terminal session is
 * rejected (400); a terminal that isn't live in the active project (already
 * gone, or belonging to another project root) resolves to `{ ok: true }`
 * without touching tmux.
 */
export function registerTerminalKillRoute(
  app: FastifyInstance,
  context: ManagedAgentsRouteContext,
): void {
  app.delete<{ Body: KillTerminalRequest }>(
    "/managed-agents/terminal",
    async (req, reply) => {
      const tmuxSession = req.body?.tmux_session;
      if (typeof tmuxSession !== "string" || tmuxSession.length === 0) {
        reply.code(400);
        return { error: "tmux_session is required" };
      }
      const parsed = parseFmarkSessionName(tmuxSession);
      if (parsed === null || parsed.kind !== "terminal") {
        reply.code(400);
        return { error: "not a terminal session" };
      }

      const projectRoot = context.routePaths().root();
      if (
        !fmarkSessionMatchesProjectRoot(tmuxSession, projectRoot) ||
        !(await context.tmux.isLiveFmarkSession(tmuxSession, projectRoot))
      ) {
        return { ok: true };
      }

      try {
        await context.tmux.killSession(tmuxSession);
      } catch {
        // The session vanished between the check and the kill — treat as closed.
      }
      context.bus.publish({
        type: "managed-agent.terminal-closed",
        tmux_session: tmuxSession,
      });
      return { ok: true };
    },
  );
}

function terminalLabel(name: unknown, index: number): string {
  return typeof name === "string" && name.length > 0
    ? name
    : `terminal ${index}`;
}
