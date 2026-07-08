import type { BusMessage } from "../types.js";

const NO_LOOSE_STRING_VALUES = {
  wss: "wss",
  ws: "ws",
} as const;

export interface WsConfig {
  baseUrl: string;
  token: string | null;
}

export type WsHandler = (m: BusMessage) => void;

export interface WsConnection {
  close(): void;
}

export interface WsOpenEvent {
  reconnected: boolean;
}

export type WsOpenHandler = (event: WsOpenEvent) => void;

const RECONNECT_BASE_DELAY_MS = 500;
const RECONNECT_MAX_DELAY_MS = 5_000;

export function connectWs(
  cfg: WsConfig,
  onMessage: WsHandler,
  onOpen?: WsOpenHandler,
): WsConnection {
  const protocol =
    cfg.baseUrl.startsWith("https:") || window.location.protocol === "https:"
      ? NO_LOOSE_STRING_VALUES.wss
      : NO_LOOSE_STRING_VALUES.ws;
  const host = cfg.baseUrl
    ? cfg.baseUrl.replace(/^https?:\/\//, "")
    : window.location.host;
  const qs = cfg.token === null ? "" : `?token=${encodeURIComponent(cfg.token)}`;
  const url = `${protocol}://${host}/ws${qs}`;
  let closed = false;
  let connectedOnce = false;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingOpenTimer: ReturnType<typeof setTimeout> | null = null;
  let socket: WebSocket | null = null;

  const clearReconnectTimer = (): void => {
    if (reconnectTimer === null) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  };

  const clearPendingOpenTimer = (): void => {
    if (pendingOpenTimer === null) return;
    clearTimeout(pendingOpenTimer);
    pendingOpenTimer = null;
  };

  const scheduleReconnect = (): void => {
    if (closed || reconnectTimer !== null) return;
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttempt,
      RECONNECT_MAX_DELAY_MS,
    );
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      openSocket();
    }, delay);
  };

  const openSocket = (): void => {
    if (closed) return;
    const next = new WebSocket(url);
    socket = next;
    next.addEventListener("open", () => {
      const reconnected = connectedOnce || reconnectAttempt > 0;
      connectedOnce = true;
      reconnectAttempt = 0;
      onOpen?.({ reconnected });
    });
    next.addEventListener("message", (e) => {
      try {
        onMessage(JSON.parse(e.data) as BusMessage);
      } catch {
        /* ignore */
      }
    });
    next.addEventListener("close", scheduleReconnect);
    next.addEventListener("error", () => {
      next.close();
    });
  };

  /* Defer the first open so React StrictMode's mount→cleanup→remount cycle
     can cancel the pending socket before the browser starts a handshake. */
  pendingOpenTimer = setTimeout(() => {
    pendingOpenTimer = null;
    openSocket();
  }, 0);

  return {
    close: () => {
      closed = true;
      clearReconnectTimer();
      clearPendingOpenTimer();
      socket?.close();
      socket = null;
    },
  };
}
