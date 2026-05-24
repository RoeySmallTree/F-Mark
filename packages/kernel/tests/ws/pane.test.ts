// packages/kernel/tests/ws/pane.test.ts
//
// Isolated /ws/pane endpoint behavior. We register `@fastify/websocket`
// directly here for unit-test ergonomics; the corresponding assembled-server
// integration coverage lives in `paneIntegration.test.ts`.
import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import websocketPlugin from "@fastify/websocket";
import WebSocket from "ws";
import { createPaneHub } from "../../src/ws/paneHub.js";
import { registerPaneWebSocket } from "../../src/ws/pane.js";
import { createInputQueue } from "../../src/tmux/inputQueue.js";

interface TmuxCall { method: string; args: unknown[]; }

interface FakeTmux {
  calls: TmuxCall[];
  setSnapshot(s: string): void;
  failNextSnapshot(err: Error): void;
  captureSnapshot(id: string): Promise<string>;
  startPipePane(id: string, fifo: string): Promise<void>;
  stopPipePane(id: string): Promise<void>;
  sendLiteralText(id: string, text: string): Promise<void>;
  sendKey(id: string, key: string): Promise<void>;
  resize(id: string, c: number, r: number): Promise<void>;
}

function fakeTmux(): FakeTmux {
  const calls: TmuxCall[] = [];
  let snapshotData = "init-snapshot";
  let snapshotError: Error | null = null;
  return {
    calls,
    setSnapshot(s) { snapshotData = s; },
    failNextSnapshot(err) { snapshotError = err; },
    async captureSnapshot(id) {
      calls.push({ method: "captureSnapshot", args: [id] });
      if (snapshotError) {
        const err = snapshotError;
        snapshotError = null;
        throw err;
      }
      return snapshotData;
    },
    async startPipePane(id, fifo) { calls.push({ method: "startPipePane", args: [id, fifo] }); },
    async stopPipePane(id) { calls.push({ method: "stopPipePane", args: [id] }); },
    async sendLiteralText(id, text) { calls.push({ method: "sendLiteralText", args: [id, text] }); },
    async sendKey(id, key) { calls.push({ method: "sendKey", args: [id, key] }); },
    async resize(id, c, r) { calls.push({ method: "resize", args: [id, c, r] }); },
  };
}

interface StartStop { kind: "start" | "stop"; paneId: string; }

async function makeApp() {
  const app = Fastify();
  await app.register(websocketPlugin);
  const tmux = fakeTmux();
  const startStops: StartStop[] = [];
  const hub = createPaneHub({
    onStart: (id) => startStops.push({ kind: "start", paneId: id }),
    onStop: (id) => startStops.push({ kind: "stop", paneId: id }),
  });
  registerPaneWebSocket(app, { tmux: tmux as any, hub, inputQueue: createInputQueue() });
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

  it("resizes before capturing the initial snapshot when cols/rows are provided", async () => {
    const { app, tmux, port } = await makeApp();
    try {
      const ws = new WebSocket(
        `ws://localhost:${port}/ws/pane?session=fmark-x&cols=132&rows=41`,
      );
      await new Promise<void>((resolve) => {
        ws.on("message", () => resolve());
      });
      expect(tmux.calls.slice(0, 2)).toEqual([
        { method: "resize", args: ["fmark-x", 132, 41] },
        { method: "captureSnapshot", args: ["fmark-x"] },
      ]);
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
      expect(tmux.calls.find((c) => c.method === "sendLiteralText")).toEqual({ method: "sendLiteralText", args: ["fmark-x", "hello"] });
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
      expect(tmux.calls.find((c) => c.method === "sendKey")).toEqual({ method: "sendKey", args: ["fmark-x", "C-c"] });
      ws.close();
    } finally {
      await app.close();
    }
  });

  it("forwards pane.resize to tmux.resize", async () => {
    const { app, tmux, port } = await makeApp();
    try {
      const ws = new WebSocket(`ws://localhost:${port}/ws/pane?session=fmark-x`);
      await new Promise<void>((resolve) => { ws.on("message", () => resolve()); });
      ws.send(JSON.stringify({ type: "pane.resize", cols: 120, rows: 40 }));
      await new Promise((r) => setTimeout(r, 100));
      expect(tmux.calls.find((c) => c.method === "resize")).toEqual({ method: "resize", args: ["fmark-x", 120, 40] });
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

  it("sends pane.error and closes with 1011 when initial snapshot fails", async () => {
    const { app, tmux, port } = await makeApp();
    try {
      tmux.failNextSnapshot(new Error("capture-pane unavailable"));
      const ws = new WebSocket(`ws://localhost:${port}/ws/pane?session=fmark-x`);
      const seen: { error?: any; closeCode?: number } = {};
      await new Promise<void>((resolve) => {
        ws.on("message", (raw) => { seen.error = JSON.parse(raw.toString()); });
        ws.on("close", (code) => { seen.closeCode = code; resolve(); });
      });
      expect(seen.error).toEqual({ type: "pane.error", error: "capture-pane unavailable" });
      expect(seen.closeCode).toBe(1011);
    } finally {
      await app.close();
    }
  });

  it("unsubscribes the client from the hub when the socket closes", async () => {
    const { app, hub, port, startStops } = await makeApp();
    try {
      const ws = new WebSocket(`ws://localhost:${port}/ws/pane?session=fmark-c`);
      await new Promise<void>((resolve) => { ws.on("message", () => resolve()); });
      expect(startStops).toEqual([{ kind: "start", paneId: "fmark-c" }]);
      expect(hub.hasSubscribers("fmark-c")).toBe(true);
      ws.close();
      // Wait for the server-side close handler to run.
      const deadline = Date.now() + 1000;
      while (hub.hasSubscribers("fmark-c") && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 20));
      }
      expect(hub.hasSubscribers("fmark-c")).toBe(false);
      expect(startStops).toEqual([
        { kind: "start", paneId: "fmark-c" },
        { kind: "stop", paneId: "fmark-c" },
      ]);
    } finally {
      await app.close();
    }
  });
});
