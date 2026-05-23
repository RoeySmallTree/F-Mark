import { createReadStream } from "node:fs";
import { mkdtemp, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type { FastifyInstance } from "fastify";
import type { TmuxManager } from "../tmux/manager.js";
import { validateMessageText } from "../runtimes/validation.js";
import { seqLog, LogLevel } from "../lib/seq-log.js";
import { createInputQueue, type InputQueue } from "../tmux/inputQueue.js";
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

async function bestEffortUnlink(path: string): Promise<void> {
  try { await unlink(path); } catch { /* already gone */ }
}

async function bestEffortRmdir(path: string): Promise<void> {
  try { await rmdir(path); } catch { /* already gone */ }
}

export interface PaneWsDeps {
  tmux: TmuxManager;
  hub: PaneHub;
  /**
   * Shared per-pane input queue. Lifted to server scope (createServer)
   * so this module and `registerManagedAgentsRoutes` enqueue tmux sends
   * against the same queue object, preventing byte-level interleaving
   * between overlay-typed input and kernel-injected slash commands.
   */
  inputQueue: InputQueue;
}

export function registerPaneWebSocket(
  app: FastifyInstance,
  deps: PaneWsDeps,
): PaneWsRegistration {
  const { tmux, hub, inputQueue } = deps;
  const pipes = new Map<string, PipeState>();
  // Per-pane FIFO serialization. Reusing the same primitive as Phase 2's
  // tmux input queue so start/stop/start sequences are guaranteed to apply
  // in caller order. This prevents three classes of bug the buddy review
  // identified for Phase 7:
  //   (a) two starts overlapping → duplicate FIFOs + tmux pipe-pane calls;
  //   (b) stop running before an in-flight start completes → stale pipe
  //       map entry, stranded tmux pipe;
  //   (c) old stop closing the wrong generation when start→stop→start
  //       interleaves.
  const pipeQueue = createInputQueue();

  function logStream(level: LogLevel, message: string, paneId: string, extra: Record<string, unknown> = {}): void {
    void seqLog(message, { module: "ws.pane", paneId, ...extra }, level);
  }

  async function tearDown(paneId: string, state: PipeState, attemptTmuxStop: boolean): Promise<void> {
    try { state.stream.destroy(); } catch { /* fall through */ }
    if (attemptTmuxStop) {
      try { await tmux.stopPipePane(paneId); } catch { /* fall through */ }
    }
    await bestEffortUnlink(state.fifoPath);
    await bestEffortRmdir(state.fifoDir);
  }

  async function startPipe(paneId: string): Promise<void> {
    await pipeQueue.enqueue(paneId, async () => {
      if (pipes.has(paneId)) return;
      const dir = await mkdtemp(join(tmpdir(), "fmark-pipe-"));
      const fifo = join(dir, "fifo");
      let mkfifoOk = false;
      try {
        await mkfifo(fifo);
        mkfifoOk = true;
        await tmux.startPipePane(paneId, fifo);
        const stream = createReadStream(fifo, { encoding: "utf8" });
        stream.on("data", (chunk) => hub.feed(paneId, String(chunk)));
        stream.on("error", (err) => {
          logStream(LogLevel.Warning, "pane stream error", paneId, {
            errorMessage: err.message,
            errorName: err.name,
          });
          // Schedule cleanup; ignore failures (stop may race with manual stopPipe).
          void stopPipe(paneId);
        });
        stream.on("end", () => {
          logStream(LogLevel.Debug, "pane stream ended", paneId);
          void stopPipe(paneId);
        });
        pipes.set(paneId, { fifoPath: fifo, fifoDir: dir, stream });
      } catch (err) {
        // Roll back any partial state. tmux.stopPipePane is only safe to
        // call if startPipePane has run; we approximate that by checking
        // whether mkfifo succeeded — if it didn't, we never called tmux.
        const attemptTmuxStop = mkfifoOk;
        if (attemptTmuxStop) {
          try { await tmux.stopPipePane(paneId); } catch { /* ignore */ }
        }
        if (mkfifoOk) await bestEffortUnlink(fifo);
        await bestEffortRmdir(dir);
        logStream(LogLevel.Warning, "pane startPipe failed", paneId, {
          errorMessage: (err as Error).message,
        });
        throw err;
      }
    });
  }

  async function stopPipe(paneId: string): Promise<void> {
    await pipeQueue.enqueue(paneId, async () => {
      const s = pipes.get(paneId);
      if (!s) return;
      pipes.delete(paneId);
      await tearDown(paneId, s, true);
    });
  }

  // Route registration is wrapped in `app.register(async (instance) => …)` so
  // it runs AFTER the websocket plugin has been loaded by the outer scope.
  // Without the wrapper, the route would be added before the plugin's onRoute
  // hook runs, and `{ websocket: true }` would silently degrade to a normal
  // HTTP handler — yielding "socket.close is not a function" when the handler
  // tries to call socket.close().
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
            // validateMessageText is synchronous; we run it BEFORE enqueueing
            // so an invalid payload surfaces a pane.error immediately and the
            // shared queue never sees a doomed task.
            const data = msg.data;
            validateMessageText(data);
            await inputQueue.enqueue(paneId, () => tmux.sendLiteralText(paneId, data));
          } else if (msg.type === "pane.key" && typeof msg.key === "string") {
            const key = msg.key;
            await inputQueue.enqueue(paneId, () => tmux.sendKey(paneId, key));
          } else if (msg.type === "pane.resize") {
            const cols = Number(msg.cols);
            const rows = Number(msg.rows);
            // Resize is technically not keystroke input, but it can interfere
            // with the agent's redraw if it lands between a slash command's
            // literal text and Enter. Serialising through the same per-pane
            // queue keeps the tmux byte stream coherent.
            await inputQueue.enqueue(paneId, () => tmux.resize(paneId, cols, rows));
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
