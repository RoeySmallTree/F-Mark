import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import websocketPlugin from "@fastify/websocket";
import WebSocket from "ws";
import { createPaneHub } from "../../src/ws/paneHub.js";
import { registerPaneWebSocket } from "../../src/ws/pane.js";

function fakeTmux() {
  const calls: { method: string; args: unknown[] }[] = [];
  let snapshotData = "init-snapshot";
  return {
    calls,
    setSnapshot(s: string) { snapshotData = s; },
    async captureSnapshot(id: string) { calls.push({ method: "captureSnapshot", args: [id] }); return snapshotData; },
    async startPipePane(id: string, fifo: string) { calls.push({ method: "startPipePane", args: [id, fifo] }); },
    async stopPipePane(id: string) { calls.push({ method: "stopPipePane", args: [id] }); },
    async sendLiteralText(id: string, text: string) { calls.push({ method: "sendLiteralText", args: [id, text] }); },
    async sendKey(id: string, key: string) { calls.push({ method: "sendKey", args: [id, key] }); },
    async resize(id: string, c: number, r: number) { calls.push({ method: "resize", args: [id, c, r] }); },
  } as any;
}

async function makeApp() {
  const app = Fastify();
  await app.register(websocketPlugin);
  const tmux = fakeTmux();
  const startStops: { kind: "start" | "stop"; paneId: string }[] = [];
  const hub = createPaneHub({
    onStart: (id) => startStops.push({ kind: "start", paneId: id }),
    onStop: (id) => startStops.push({ kind: "stop", paneId: id }),
  });
  // Bridge hub onStart/onStop to the pipe controls (skipped in unit test; we only want the hub semantics + ws message exchange).
  registerPaneWebSocket(app, { tmux, hub });
  await app.listen({ port: 0 });
  const port = (app.server.address() as any).port;
  return { app, tmux, hub, startStops, port };
}

describe("/ws/pane endpoint", () => {
  it("sends snapshot on connect and forwards hub feeds as pane.data", async () => {
    const { app, hub, port } = await makeApp();
    try {
      const ws = new WebSocket(`ws://localhost:${port}/ws/pane?session=fmark-x`);
      const messages: any[] = [];
      await new Promise<void>((resolve) => {
        ws.on("message", (raw) => {
          messages.push(JSON.parse(raw.toString()));
          if (messages.length === 2) resolve();
        });
        ws.on("open", () => {
          setTimeout(() => hub.feed("fmark-x", "live-chunk"), 50);
        });
      });
      expect(messages[0]).toEqual({ type: "pane.snapshot", data: "init-snapshot" });
      expect(messages[1]).toEqual({ type: "pane.data", data: "live-chunk" });
      ws.close();
    } finally {
      await app.close();
    }
  });

  it("forwards pane.input to tmux.sendLiteralText", async () => {
    const { app, tmux, port } = await makeApp();
    try {
      const ws = new WebSocket(`ws://localhost:${port}/ws/pane?session=fmark-x`);
      await new Promise<void>((resolve) => {
        ws.on("message", () => resolve()); // wait for snapshot then proceed
      });
      ws.send(JSON.stringify({ type: "pane.input", data: "hello" }));
      await new Promise((r) => setTimeout(r, 100));
      expect(tmux.calls.find((c: any) => c.method === "sendLiteralText")).toEqual({ method: "sendLiteralText", args: ["fmark-x", "hello"] });
      ws.close();
    } finally {
      await app.close();
    }
  });

  it("forwards pane.key to tmux.sendKey", async () => {
    const { app, tmux, port } = await makeApp();
    try {
      const ws = new WebSocket(`ws://localhost:${port}/ws/pane?session=fmark-x`);
      await new Promise<void>((resolve) => { ws.on("message", () => resolve()); });
      ws.send(JSON.stringify({ type: "pane.key", key: "C-c" }));
      await new Promise((r) => setTimeout(r, 100));
      expect(tmux.calls.find((c: any) => c.method === "sendKey")).toEqual({ method: "sendKey", args: ["fmark-x", "C-c"] });
      ws.close();
    } finally {
      await app.close();
    }
  });

  it("closes the socket if session param missing", async () => {
    const { app, port } = await makeApp();
    try {
      const ws = new WebSocket(`ws://localhost:${port}/ws/pane`);
      await new Promise<void>((resolve) => { ws.on("close", () => resolve()); });
      expect(ws.readyState).toBe(WebSocket.CLOSED);
    } finally {
      await app.close();
    }
  });
});
