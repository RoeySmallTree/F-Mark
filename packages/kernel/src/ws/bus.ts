import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import type {
  AgentStatusRow,
  ForkedAgentResult,
  SessionWithPath,
} from "@f-mark/shared";
import type { PresenceState } from "../presence/tracker.js";

/* Every BusMessage carries an optional `pathId` + `revision` envelope.
   The kernel's WS wrap (wrapBusWithEnvelope) injects current values on
   every publish; publishers themselves don't set these fields. The
   renderer filters incoming messages by (pathId, revision) to drop stale
   events from a path that's no longer active. Optional so direct fake-bus
   tests (which don't go through the wrap) keep working. */
export interface BusEnvelope {
  pathId?: string | null;
  revision?: number;
}

export interface EventAddedMessage extends BusEnvelope {
  type: "event_added";
  session_id: string;
  filename: string;
  kind: string;
  participant_id: string;
}

export interface EventSupersededMessage extends BusEnvelope {
  type: "event_superseded";
  session_id: string;
  filename: string;
  supersedes: string;
}

export interface PresenceMessage extends BusEnvelope {
  type: "presence";
  participant_id: string;
  state: PresenceState;
  last_hook_at: number | null;
}

export interface ManagedAgentSpawnedMessage extends BusEnvelope {
  type: "managed-agent.spawned";
  participant_id: string;
  tmux_session: string;
  runtime_id: string;
  /* Session this agent is bound to (from spawn body.session_id). Null when
     spawn was called without a session_id. Mirrors the shared wire type
     in @f-mark/shared so renderer chip-strip filtering can rely on it. */
  active_session: string | null;
}

export interface ManagedAgentKilledMessage extends BusEnvelope {
  type: "managed-agent.killed";
  participant_id: string;
}

export interface ManagedAgentUpdatedMessage extends BusEnvelope {
  type: "managed-agent.updated";
  agent: AgentStatusRow;
}

export interface ManagedAgentTerminalSpawnedMessage extends BusEnvelope {
  type: "managed-agent.terminal-spawned";
  tmux_session: string;
  label: string;
  index: number;
}

export interface ManagedAgentTerminalClosedMessage extends BusEnvelope {
  type: "managed-agent.terminal-closed";
  tmux_session: string;
}

export interface EnvProbeUpdatedMessage extends BusEnvelope {
  type: "env-probe.updated";
  result: unknown;
}

export interface SessionForkedMessage extends BusEnvelope {
  type: "session.forked";
  source_session_id: string;
  session: SessionWithPath;
  agents: ForkedAgentResult[];
  warnings: string[];
}

export interface SessionRenamedMessage extends BusEnvelope {
  type: "session.renamed";
  /* The session id is immutable; a rename only changes the display slug in
     the session meta. Clients refresh labels — nothing is keyed by name. */
  session: SessionWithPath;
}

export interface FilesChangedMessage extends BusEnvelope {
  type: "files.changed";
  root: string;
}

export interface PathsUpdatedMessage {
  type: "paths-updated";
  paths: Array<{ path: string; path_id: string }>;
}

/* path-switched — deprecated compatibility broadcast for old clients that
   still call /paths/active. New clients consume paths-updated and keep their
   selected session/root local instead of treating this as a tab-wide switch. */
export interface PathSwitchedMessage {
  type: "path-switched";
  activePath: string | null;
  pathId: string | null;
  revision: number;
}

export type BusMessage =
  | EventAddedMessage
  | EventSupersededMessage
  | PresenceMessage
  | ManagedAgentSpawnedMessage
  | ManagedAgentKilledMessage
  | ManagedAgentUpdatedMessage
  | ManagedAgentTerminalSpawnedMessage
  | ManagedAgentTerminalClosedMessage
  | EnvProbeUpdatedMessage
  | SessionForkedMessage
  | SessionRenamedMessage
  | FilesChangedMessage
  | PathsUpdatedMessage
  | PathSwitchedMessage;

export interface Bus {
  publish(message: BusMessage): void;
}

/**
 * Registers the global `/ws` broadcast route on the given Fastify scope.
 *
 * Requires `@fastify/websocket` to already be available on this scope (or an
 * ancestor scope). In F-Mark, `createServer()` registers the plugin once at
 * the root so this function and `registerPaneWebSocket` can both attach
 * `{ websocket: true }` routes.
 */
export function registerWebSocket(app: FastifyInstance): Bus {
  const clients = new Set<WebSocket>();

  app.get("/ws", { websocket: true }, (socket) => {
    clients.add(socket);
    socket.on("close", () => clients.delete(socket));
    socket.on("error", () => clients.delete(socket));
  });

  return {
    publish(message: BusMessage): void {
      const data = JSON.stringify(message);
      for (const c of clients) {
        if (c.readyState === c.OPEN) c.send(data);
      }
    },
  };
}
