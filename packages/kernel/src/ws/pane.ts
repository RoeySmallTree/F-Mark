import { createReadStream } from "node:fs";
import { mkdtemp, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type { FastifyInstance } from "fastify";
import type { TmuxManager } from "../tmux/manager.js";
import { validateMessageText } from "../runtimes/validation.js";
import type { PaneHub } from "./paneHub.js";

export interface PaneWsRegistration {
  startPipe(paneId: string): Promise<void>;
  stopPipe(paneId: string): Promise<void>;
}

interface PipeState {
  fifoPath: string;
  fifoDir: string;
  stream: ReturnType<typeof createReadStream>;
}

async function mkfifo(path: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const c = spawn("mkfifo", [path]);
    c.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`mkfifo exit ${code}`))));
    c.on("error", (err) => reject(err));
  });
}

export function registerPaneWebSocket(
  app: FastifyInstance,
  deps: { tmux: TmuxManager; hub: PaneHub },
): PaneWsRegistration {
  const { tmux, hub } = deps;
  const pipes = new Map<string, PipeState>();

  async function startPipe(paneId: string): Promise<void> {
    if (pipes.has(paneId)) return;
    const dir = await mkdtemp(join(tmpdir(), "fmark-pipe-"));
    const fifo = join(dir, "fifo");
    await mkfifo(fifo);
    await tmux.startPipePane(paneId, fifo);
    const stream = createReadStream(fifo, { encoding: "utf8" });
    stream.on("data", (chunk) => hub.feed(paneId, String(chunk)));
    stream.on("error", () => { /* fifo gone, just stop */ });
    pipes.set(paneId, { fifoPath: fifo, fifoDir: dir, stream });
  }

  async function stopPipe(paneId: string): Promise<void> {
    const s = pipes.get(paneId);
    if (!s) return;
    pipes.delete(paneId);
    try { s.stream.destroy(); } catch {}
    try { await tmux.stopPipePane(paneId); } catch {}
    try { await unlink(s.fifoPath); } catch {}
    try { await rmdir(s.fifoDir); } catch {}
  }

  app.register(async (instance) => {
    instance.get("/ws/pane", { websocket: true }, async (socket, req) => {
      const url = new URL(req.url ?? "/", "http://internal");
      const paneId = url.searchParams.get("session");
      if (!paneId) {
        socket.close(1008, "session query param required");
        return;
      }

      // Send initial snapshot.
      try {
        const snapshot = await tmux.captureSnapshot(paneId);
        socket.send(JSON.stringify({ type: "pane.snapshot", data: snapshot }));
      } catch (e: any) {
        socket.send(JSON.stringify({ type: "pane.error", error: e.message }));
        socket.close(1011, "snapshot failed");
        return;
      }

      const sub = hub.subscribe(paneId, (chunk) => {
        try { socket.send(JSON.stringify({ type: "pane.data", data: chunk })); } catch {}
      });

      socket.on("message", async (raw: Buffer) => {
        let msg: any;
        try { msg = JSON.parse(raw.toString()); } catch { return; }
        try {
          if (msg.type === "pane.input" && typeof msg.data === "string") {
            validateMessageText(msg.data);
            await tmux.sendLiteralText(paneId, msg.data);
          } else if (msg.type === "pane.key" && typeof msg.key === "string") {
            await tmux.sendKey(paneId, msg.key);
          } else if (msg.type === "pane.resize") {
            await tmux.resize(paneId, Number(msg.cols), Number(msg.rows));
          }
        } catch (e: any) {
          try { socket.send(JSON.stringify({ type: "pane.error", error: e.message })); } catch {}
        }
      });

      socket.on("close", () => sub.unsubscribe());
      socket.on("error", () => sub.unsubscribe());
    });
  });

  return { startPipe, stopPipe };
}
