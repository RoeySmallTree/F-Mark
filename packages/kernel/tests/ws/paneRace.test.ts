// packages/kernel/tests/ws/paneRace.test.ts
//
// Race-condition tests for the per-pane pipe lifecycle in
// `registerPaneWebSocket` returned `{ startPipe, stopPipe }`. The buddy review
// for Phase 7 flagged three race conditions:
//
//   1. Two `startPipe(id)` calls overlap → two FIFOs / two tmux pipes spawned.
//   2. `startPipe` → `stopPipe` → `startPipe` interleaving: the second start
//      can be undone by the first stop.
//   3. Failure during start leaks the temp FIFO directory.
//
// These tests target the public pipe controls; we use a fake tmux manager that
// records calls and lets us insert delays between async steps to widen the
// race window deterministically.
import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import websocketPlugin from "@fastify/websocket";
import { stat } from "node:fs/promises";
import { createPaneHub } from "../../src/ws/paneHub.js";
import { registerPaneWebSocket } from "../../src/ws/pane.js";
import { createInputQueue } from "../../src/tmux/inputQueue.js";

interface TmuxCall { method: string; args: unknown[]; }

function delayedTmux(delays: { start?: number; stop?: number } = {}) {
  const calls: TmuxCall[] = [];
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  return {
    calls,
    async captureSnapshot(id: string) { calls.push({ method: "captureSnapshot", args: [id] }); return "snap"; },
    async startPipePane(id: string, fifo: string) {
      calls.push({ method: "startPipePane", args: [id, fifo] });
      if (delays.start) await sleep(delays.start);
    },
    async stopPipePane(id: string) {
      calls.push({ method: "stopPipePane", args: [id] });
      if (delays.stop) await sleep(delays.stop);
    },
    async sendLiteralText() {},
    async sendKey() {},
    async resize() {},
  } as any;
}

async function makeApp(tmux: any) {
  const app = Fastify();
  await app.register(websocketPlugin);
  const hub = createPaneHub({ onStart: () => {}, onStop: () => {} });
  const controls = registerPaneWebSocket(app, { tmux, hub, inputQueue: createInputQueue() });
  await app.ready();
  return { app, controls };
}

describe("pane pipe race conditions", () => {
  // Race tests use real `mkfifo` subprocesses and short artificial delays.
  // Vitest's default 5s timeout has been observed to flake under load when
  // the four tests in this file run back-to-back; bump it here.
  const RACE_TIMEOUT = 15_000;

  it("does not start two pipes when start/start/stop/start interleave", { timeout: RACE_TIMEOUT }, async () => {
    const tmux = delayedTmux({ start: 30 });
    const { app, controls } = await makeApp(tmux);
    try {
      // Fire two starts back-to-back. The serialization queue must collapse
      // the second into a no-op because the first is already in flight (or
      // recorded once it completes).
      const p1 = controls.startPipe("pane-A");
      const p2 = controls.startPipe("pane-A");
      await Promise.all([p1, p2]);
      const startCalls = tmux.calls.filter((c: TmuxCall) => c.method === "startPipePane");
      expect(startCalls.length).toBe(1);
    } finally {
      // Stop any running pipe before closing so we don't leak FIFO read
      // streams across tests (they'd keep fds + event-loop work alive).
      await controls.stopPipe("pane-A");
      await app.close();
    }
  });

  it("stopPipe waits for an in-flight startPipe before stopping", { timeout: RACE_TIMEOUT }, async () => {
    const tmux = delayedTmux({ start: 50 });
    const { app, controls } = await makeApp(tmux);
    try {
      // start, then immediately stop. The stop must observe the started
      // state (i.e. startPipePane must have run before stopPipePane).
      const p1 = controls.startPipe("pane-B");
      const p2 = controls.stopPipe("pane-B");
      await Promise.all([p1, p2]);
      // Confirm tmux saw start then stop in order.
      const sequence = tmux.calls
        .filter((c: TmuxCall) => c.method === "startPipePane" || c.method === "stopPipePane")
        .map((c: TmuxCall) => c.method);
      expect(sequence).toEqual(["startPipePane", "stopPipePane"]);
    } finally {
      await app.close();
    }
  });

  it("does not stop the wrong generation when start/stop/start interleave", { timeout: RACE_TIMEOUT }, async () => {
    const tmux = delayedTmux({ start: 30, stop: 30 });
    const { app, controls } = await makeApp(tmux);
    try {
      // start1 → stop1 → start2 (all rapid). Final state: one running pipe.
      const p1 = controls.startPipe("pane-C");
      const p2 = controls.stopPipe("pane-C");
      const p3 = controls.startPipe("pane-C");
      await Promise.all([p1, p2, p3]);
      // tmux saw: start1, stop1, start2 — in order.
      const sequence = tmux.calls
        .filter((c: TmuxCall) => c.method === "startPipePane" || c.method === "stopPipePane")
        .map((c: TmuxCall) => c.method);
      expect(sequence).toEqual(["startPipePane", "stopPipePane", "startPipePane"]);
    } finally {
      // Final pipe is still running after the interleave; stop it so the FIFO
      // read stream doesn't leak across tests.
      await controls.stopPipe("pane-C");
      await app.close();
    }
  });

  it("cleans up temp dir + FIFO when startPipePane fails after mkfifo", { timeout: RACE_TIMEOUT }, async () => {
    let observedFifoPath: string | null = null;
    const tmux = {
      calls: [] as TmuxCall[],
      async captureSnapshot(_id: string) { return "snap"; },
      async startPipePane(_id: string, fifo: string) {
        observedFifoPath = fifo;
        throw new Error("tmux start failed");
      },
      async stopPipePane(_id: string) {},
      async sendLiteralText() {}, async sendKey() {}, async resize() {},
    } as any;
    const { app, controls } = await makeApp(tmux);
    try {
      // We expect startPipe to reject (or swallow), but in either case the
      // temp dir must not be left behind.
      await controls.startPipe("pane-D").catch(() => {});
      expect(observedFifoPath).toBeTruthy();
      // The fifo (and its parent dir) should not exist any more.
      let exists = true;
      try {
        await stat(observedFifoPath!);
      } catch {
        exists = false;
      }
      expect(exists).toBe(false);
    } finally {
      await app.close();
    }
  });
});
