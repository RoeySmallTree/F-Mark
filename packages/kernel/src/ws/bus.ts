import type { FastifyInstance } from "fastify";
import websocketPlugin from "@fastify/websocket";
import type { WebSocket } from "ws";

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

export type BusMessage = EventAddedMessage | EventSupersededMessage;

export interface Bus {
  publish(message: BusMessage): void;
}

export async function registerWebSocket(app: FastifyInstance): Promise<Bus> {
  await app.register(websocketPlugin);
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
