import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import type { PresenceState } from "../presence/tracker.js";

export interface EventAddedMessage {
  type: "event_added";
  session_id: string;
  filename: string;
  kind: string;
  participant_id: string;
}

export interface EventSupersededMessage {
  type: "event_superseded";
  session_id: string;
  filename: string;
  supersedes: string;
}

export interface PresenceMessage {
  type: "presence";
  participant_id: string;
  state: PresenceState;
  last_hook_at: number | null;
}

export interface ManagedAgentSpawnedMessage {
  type: "managed-agent.spawned";
  participant_id: string;
  tmux_session: string;
  runtime_id: string;
}

export interface ManagedAgentKilledMessage {
  type: "managed-agent.killed";
  participant_id: string;
}

export interface ManagedAgentTerminalSpawnedMessage {
  type: "managed-agent.terminal-spawned";
  tmux_session: string;
  label: string;
}

export interface EnvProbeUpdatedMessage {
  type: "env-probe.updated";
  result: unknown;
}

export type BusMessage =
  | EventAddedMessage
  | EventSupersededMessage
  | PresenceMessage
  | ManagedAgentSpawnedMessage
  | ManagedAgentKilledMessage
  | ManagedAgentTerminalSpawnedMessage
  | EnvProbeUpdatedMessage;

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
