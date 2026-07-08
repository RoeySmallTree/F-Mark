// packages/kernel/tests/integration/inputQueueShared.test.ts
//
// Phase 8 buddy-review CRITICAL: the per-pane input queue MUST serialize both
// kernel-injected commands (`POST /managed-agents/:id/command`) and overlay-
// typed WS input (`/ws/pane` pane.input / pane.key). The two subsystems used
// to maintain independent queues, which let bytes interleave at the tmux byte
// stream when the user typed in the overlay concurrently with a slash command.
//
// We verify the spec invariant with TWO complementary tests:
//
//   1. **Wiring test (deterministic).** We hand `registerManagedAgentsRoutes`
//      and `registerPaneWebSocket` the SAME `InputQueue` instrumented to count
//      every `enqueue` call against the live tmux session. Both subsystems'
//      operations must show up on that single queue.
//   2. **High-concurrency integration smoke test.** We pump many overlapping
//      `/command` and WS `pane.input` requests against the assembled
//      `createServer()` and walk the recorded tmux argv stream. Every
//      `send-keys -l … <text>` followed by a `send-keys … C-m` must be
//      contiguous for the same session — no other literal lands between the
//      two halves of an atomic pair.
import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import websocketPlugin from "@fastify/websocket";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { createServer } from "../../src/server.js";
import { initProject } from "../../src/project.js";
import { paths } from "../../src/paths.js";
import { writeTmuxSession } from "../../src/agents/managed.js";
import { registerManagedAgentsRoutes } from "../../src/routes/managedAgents.js";
import { registerPaneWebSocket } from "../../src/ws/pane.js";
import { createPaneHub } from "../../src/ws/paneHub.js";
import { createPresenceTracker } from "../../src/presence/tracker.js";
import { createInputQueue, type InputQueue } from "../../src/tmux/inputQueue.js";
import type { CommandRunner } from "../../src/tmux/commandRunner.js";
import type { TmuxManager } from "../../src/tmux/manager.js";

/**
 * InputQueue wrapper that records every (paneKey, kind) pair as the caller
 * enqueues a task. Used to prove a single queue instance is shared across
 * both subsystems.
 */
interface InstrumentedQueue extends InputQueue {
  enqueues: Array<{ paneKey: string }>;
}

function instrumentedQueue(): InstrumentedQueue {
  const inner = createInputQueue();
  const enqueues: Array<{ paneKey: string }> = [];
  return {
    enqueues,
    enqueue<T>(paneKey: string, task: () => Promise<T>): Promise<T> {
      enqueues.push({ paneKey });
      return inner.enqueue(paneKey, task);
    },
  };
}

/**
 * Permissive command runner: records every tmux argv it sees in order, returns
 * canned outputs for the commands the assembled server actually fires.
 */
function permissiveRunner(opts: { sendKeysDelayMs?: number } = {}): CommandRunner & {
  calls: string[][];
} {
  const calls: string[][] = [];
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  return {
    calls,
    async run(argv) {
      calls.push([...argv]);
      if (argv[0] !== "tmux") {
        return { stdout: "", stderr: "unexpected", exitCode: 1 };
      }
      const sub = argv[1];
      if (sub === "capture-pane") {
        return { stdout: "snap", stderr: "", exitCode: 0 };
      }
      if (sub === "display-message") {
        return { stdout: "0", stderr: "", exitCode: 0 };
      }
      if (sub === "send-keys" || sub === "load-buffer" || sub === "paste-buffer") {
        if (opts.sendKeysDelayMs) await sleep(opts.sendKeysDelayMs);
        return { stdout: "", stderr: "", exitCode: 0 };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    },
  };
}

interface Pair {
  text: string;
  hasEnter: boolean;
}

function extractLiteralEnterPairs(argvs: string[][], sessionName: string): Pair[] {
  const calls = argvs
    .map((argv, i) => ({ argv, i }))
    .filter(({ argv }) => argv[0] === "tmux" && argv[1] === "send-keys");
  const pairs: Pair[] = [];
  for (let k = 0; k < calls.length; k++) {
    const { argv } = calls[k]!;
    const tIdx = argv.indexOf("-t");
    if (tIdx === -1 || argv[tIdx + 1] !== sessionName) continue;
    if (!argv.includes("-l")) continue; // only consider literal-text calls
    const dashDash = argv.lastIndexOf("--");
    const text = argv[dashDash + 1] ?? "";
    let hasEnter = false;
    for (let j = k + 1; j < calls.length; j++) {
      const nxt = calls[j]!;
      const nxtT = nxt.argv.indexOf("-t");
      if (nxtT === -1 || nxt.argv[nxtT + 1] !== sessionName) continue;
      const nxtIsLiteral = nxt.argv.includes("-l");
      if (nxtIsLiteral) break; // another literal landed before our Enter
      const nxtDashDash = nxt.argv.lastIndexOf("--");
      const nxtPayload = nxt.argv[nxtDashDash + 1] ?? "";
      if (nxtPayload === "C-m") hasEnter = true;
      break;
    }
    pairs.push({ text, hasEnter });
  }
  return pairs;
}

/* The /command message path now delivers via bracketed paste: load-buffer,
   paste-buffer, then Enter (+ a confirm Enter). The atomic unit to protect is
   paste-buffer → C-m: no overlay literal may land between the paste and its
   submit for the same session. */
function extractPasteEnterPairs(argvs: string[][], sessionName: string): Pair[] {
  const pairs: Pair[] = [];
  for (let k = 0; k < argvs.length; k++) {
    const argv = argvs[k]!;
    if (argv[0] !== "tmux" || argv[1] !== "paste-buffer") continue;
    const tIdx = argv.indexOf("-t");
    if (tIdx === -1 || argv[tIdx + 1] !== sessionName) continue;
    const bIdx = argv.indexOf("-b");
    const text = argv[bIdx + 1] ?? "";
    let hasEnter = false;
    for (let j = k + 1; j < argvs.length; j++) {
      const nxt = argvs[j]!;
      if (nxt[0] !== "tmux" || nxt[1] !== "send-keys") continue;
      const nxtT = nxt.indexOf("-t");
      if (nxtT === -1 || nxt[nxtT + 1] !== sessionName) continue;
      if (nxt.includes("-l")) break; // an overlay literal beat our Enter
      const nxtDashDash = nxt.lastIndexOf("--");
      if (nxt[nxtDashDash + 1] === "C-m") hasEnter = true;
      break;
    }
    pairs.push({ text, hasEnter });
  }
  return pairs;
}

describe("shared input queue across managed-agents and /ws/pane", () => {
  // --- Wiring test ----------------------------------------------------------
  // The strongest possible proof of the spec invariant: a SINGLE InputQueue
  // instance is handed to both `registerManagedAgentsRoutes` and
  // `registerPaneWebSocket`, and BOTH subsystems route their tmux sends
  // through that queue. We make the queue an instrumented spy so we can
  // count enqueues from each path and verify they target the same paneKey.
  it("uses a single shared InputQueue for both /command and /ws/pane sends", async () => {
    const root = await mkdtemp(join(tmpdir(), "fmark-q-wiring-"));
    try {
      const p = paths(root);
      await initProject(p);
      const sessionName = "fmark-test-12345678-ag-ag-wire";
      await writeTmuxSession(join(p.fmarkDir(), "agents"), "ag-wire", sessionName);

      // Build a minimal Fastify app and wire both subsystems against the
      // same instrumented queue.
      const app = Fastify();
      await app.register(websocketPlugin);
      const queue = instrumentedQueue();
      const tracker = createPresenceTracker({ broadcast: () => {} });
      const fakeTmux: TmuxManager = {
        spawnAgent: async () => ({ sessionName: "x" }),
        spawnTerminal: async () => ({ sessionName: "x" }),
        listFmarkSessions: async () => [],
        killSession: async () => {},
        captureSnapshot: async () => "snap",
        startPipePane: async () => {},
        stopPipePane: async () => {},
        sendLiteralText: async () => {},
        sendKey: async () => {},
        deliverPrompt: async () => {},
        resize: async () => {},
        paneAlive: async () => true,
        getVersion: async () => null,
        getUserOption: async () => null,
      };

      registerManagedAgentsRoutes(app, {
        paths: p,
        tmux: fakeTmux,
        tracker,
        projectRoot: root,
        inputQueue: queue,
        bus: { publish: () => {} },
      });
      const hub = createPaneHub({ onStart: () => {}, onStop: () => {} });
      registerPaneWebSocket(app, { tmux: fakeTmux, hub, inputQueue: queue });
      await app.listen({ port: 0, host: "127.0.0.1" });
      const addr = app.server.address();
      const port = typeof addr === "object" && addr !== null ? addr.port : 0;

      // 1. HTTP command path: inject a "message" via /command.
      const cmdRes = await app.inject({
        method: "POST",
        url: "/managed-agents/ag-wire/command",
        payload: { type: "message", text: "from-cmd" },
      });
      expect(cmdRes.statusCode).toBe(200);

      // 2. WS path: send a pane.input + pane.key.
      const ws = new WebSocket(
        `ws://127.0.0.1:${port}/ws/pane?session=${sessionName}`,
      );
      await new Promise<void>((resolve, reject) => {
        ws.on("message", () => resolve());
        ws.on("error", reject);
      });
      ws.send(JSON.stringify({ type: "pane.input", data: "from-ws" }));
      ws.send(JSON.stringify({ type: "pane.key", key: "C-m" }));
      ws.send(JSON.stringify({ type: "pane.resize", cols: 80, rows: 24 }));
      // Give the WS handler time to enqueue.
      await new Promise((r) => setTimeout(r, 150));

      // Both subsystems must have used the shared queue against the same
      // pane key (the tmux session name).
      const keys = new Set(queue.enqueues.map((e) => e.paneKey));
      expect(keys.has(sessionName)).toBe(true);
      // We expect at least 1 enqueue from /command (the message pair is one
      // closure) and at least 3 from /ws/pane (pane.input, pane.key,
      // pane.resize).
      expect(queue.enqueues.length).toBeGreaterThanOrEqual(4);

      ws.close();
      await app.close();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  // --- Concurrency smoke test ----------------------------------------------
  // Pump many overlapping /command + /ws/pane operations through the
  // assembled `createServer()` and verify the recorded tmux argv stream
  // shows no interleaved literal/Enter pair for the managed session.
  it("never interleaves a literal+Enter pair under concurrent /command and /ws/pane traffic", async () => {
    const root = await mkdtemp(join(tmpdir(), "fmark-q-conc-"));
    try {
      const p = paths(root);
      await initProject(p);
      const sessionName = "fmark-test-12345678-ag-ag-claude-1";
      await writeTmuxSession(join(p.fmarkDir(), "agents"), "ag-claude-1", sessionName);

      // 25ms per send-keys widens any race window in the assembled server.
      const runner = permissiveRunner({ sendKeysDelayMs: 25 });
      const { app } = createServer({
        token: "tok-int",
        paths: p,
        commandRunner: runner,
        promptDelays: { settleMs: 0, confirmMs: 0 },
      });
      await app.listen({ port: 0, host: "127.0.0.1" });
      const addr = app.server.address();
      const port = typeof addr === "object" && addr !== null ? addr.port : 0;

      const ws = new WebSocket(
        `ws://127.0.0.1:${port}/ws/pane?session=${sessionName}`,
        { headers: { Authorization: "Bearer tok-int" } },
      );
      await new Promise<void>((resolve, reject) => {
        ws.on("message", () => resolve());
        ws.on("error", reject);
        ws.on("unexpected-response", (_req, res) =>
          reject(new Error(`unexpected response: ${res.statusCode}`)),
        );
      });

      // Interleaved drive: fire one HTTP command, then one WS pair, then
      // next HTTP command, etc. The HTTP awaits force at least one
      // round-trip per command so subsequent WS frames land between sends.
      const N = 8;
      for (let i = 0; i < N; i++) {
        // Fire the HTTP command without awaiting so the WS frames can
        // overlap.
        const fetchP = fetch(
          `http://127.0.0.1:${port}/managed-agents/ag-claude-1/command`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer tok-int",
            },
            body: JSON.stringify({ type: "message", text: `cmd-${i}` }),
          },
        );
        ws.send(JSON.stringify({ type: "pane.input", data: `ws-${i}` }));
        ws.send(JSON.stringify({ type: "pane.key", key: "C-m" }));
        // Yield to the event loop so HTTP makes progress.
        await new Promise((r) => setImmediate(r));
        // Await the fetch but only every other iteration, to keep some
        // concurrency in flight.
        if (i % 2 === 0) {
          const r = await fetchP;
          expect(r.status).toBe(200);
        } else {
          // Don't await this one; we'll drain at the end.
          void fetchP.then((r) => {
            // We can't access response status from a discarded promise; the
            // assertion above on every-other request suffices to ensure the
            // server is healthy.
            void r;
          });
        }
      }
      // Give time for in-flight tasks to drain.
      await new Promise((r) => setTimeout(r, 1500));

      const pairs = [
        ...extractLiteralEnterPairs(runner.calls, sessionName),
        ...extractPasteEnterPairs(runner.calls, sessionName),
      ];
      const interleaved = pairs.filter((pair) => !pair.hasEnter);
      const sendKeysSeq = runner.calls
        .filter((c) => c[0] === "tmux" && c[1] === "send-keys")
        .map((c) => {
          const lit = c.includes("-l");
          const dashDash = c.lastIndexOf("--");
          const payload = c[dashDash + 1] ?? "";
          return `${lit ? "lit" : "key"}:${payload}`;
        });
      expect(
        interleaved,
        `interleaved pairs detected — every literal must be followed immediately by C-m for the same session.\nsequence: ${JSON.stringify(sendKeysSeq)}`,
      ).toEqual([]);

      ws.close();
      await app.close();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
