import type { BusMessage } from "../types.js";

export interface WsConfig {
  baseUrl: string;
  token: string | null;
}

export type WsHandler = (m: BusMessage) => void;

export interface WsConnection {
  close(): void;
}

export function connectWs(cfg: WsConfig, onMessage: WsHandler): WsConnection {
  const protocol =
    cfg.baseUrl.startsWith("https:") || window.location.protocol === "https:"
      ? "wss"
      : "ws";
  const host = cfg.baseUrl
    ? cfg.baseUrl.replace(/^https?:\/\//, "")
    : window.location.host;
  const qs = cfg.token === null ? "" : `?token=${encodeURIComponent(cfg.token)}`;
  const url = `${protocol}://${host}/ws${qs}`;
  const socket = new WebSocket(url);
  socket.addEventListener("message", (e) => {
    try {
      onMessage(JSON.parse(e.data) as BusMessage);
    } catch {
      /* ignore */
    }
  });
  return {
    close: () => socket.close(),
  };
}
