// packages/kernel/tests/ws/paneIntegration.test.ts
//
// Integration tests that go through the assembled `createServer()` to prove
// /ws/pane is a working WebSocket endpoint in the real wiring (not just the
// isolated test app from pane.test.ts).
//
// Buddy review for Phase 7 caught that the websocket plugin was scoped to the
// inner block that owns /ws, so /ws/pane returned HTTP 500. This test connects
// over a real socket against `createServer()` and asserts the snapshot arrives.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { createServer } from "../../src/server.js";
import { initProject } from "../../src/project.js";
import { paths } from "../../src/paths.js";
import type { CommandRunner } from "../../src/tmux/commandRunner.js";

// CommandRunner stub that returns canned outputs for whatever tmux commands
// the assembled server fires. Matches the spec from the spec map in pane.ts +
// manager.ts:
//   capture-pane              → snapshot
//   pipe-pane -t … -o cat     → start pipe (FIFO not actually opened)
//   pipe-pane -t …            → stop pipe
//   send-keys                 → ack
//   resize-window             → ack
//   display-message           → "0" (pane alive)
function permissiveRunner(captureOutput = "init-snapshot"): CommandRunner {
  return {
    async run(argv) {
      if (argv[0] !== "tmux") {
        return { stdout: "", stderr: "unexpected", exitCode: 1 };
      }
      const sub = argv[1];
      if (sub === "capture-pane") {
        return { stdout: captureOutput, stderr: "", exitCode: 0 };
      }
      if (sub === "display-message") {
        return { stdout: "0", stderr: "", exitCode: 0 };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    },
  };
}

interface TestServer {
  port: number;
  close(): Promise<void>;
}

async function startTestServer(runner: CommandRunner): Promise<TestServer> {
  const root = await mkdtemp(join(tmpdir(), "fmark-pane-itest-"));
  const p = paths(root);
  await initProject(p);
  const { app } = createServer({
    token: null,
    paths: p,
    allowProcessApiNoAuth: true,
    commandRunner: runner,
  });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    port,
    async close() {
      await app.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

describe("createServer /ws/pane integration", () => {
  let server: TestServer | null = null;

  beforeEach(() => {
    server = null;
  });

  afterEach(async () => {
    if (server) await server.close();
    server = null;
  });

  it("upgrades a /ws/pane connection (no HTTP 500 from the assembled server)", async () => {
    server = await startTestServer(permissiveRunner("snapshot-A"));
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws/pane?session=fmark-x`);
    const first = await new Promise<any>((resolve, reject) => {
      ws.on("message", (raw) => resolve(JSON.parse(raw.toString())));
      ws.on("error", (err) => reject(err));
      ws.on("unexpected-response", (_req, res) => {
        reject(new Error(`unexpected response: ${res.statusCode}`));
      });
    });
    expect(first).toEqual({ type: "pane.snapshot", data: "snapshot-A" });
    ws.close();
  });

  it("closes the socket with 1008 when ?session= query param is missing", async () => {
    server = await startTestServer(permissiveRunner());
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws/pane`);
    const code = await new Promise<number>((resolve, reject) => {
      ws.on("close", (c) => resolve(c));
      ws.on("error", (err) => reject(err));
      ws.on("unexpected-response", (_req, res) => {
        reject(new Error(`unexpected response: ${res.statusCode}`));
      });
    });
    expect(code).toBe(1008);
  });

  it("global /ws and per-pane /ws/pane both work side-by-side", async () => {
    server = await startTestServer(permissiveRunner("snapshot-B"));
    const wsBus = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
    await new Promise<void>((res, rej) => {
      wsBus.on("open", () => res());
      wsBus.on("error", rej);
      wsBus.on("unexpected-response", (_req, response) => {
        rej(new Error(`/ws unexpected response: ${response.statusCode}`));
      });
    });
    const wsPane = new WebSocket(`ws://127.0.0.1:${server.port}/ws/pane?session=fmark-y`);
    const snapshot = await new Promise<any>((resolve, reject) => {
      wsPane.on("message", (raw) => resolve(JSON.parse(raw.toString())));
      wsPane.on("error", reject);
      wsPane.on("unexpected-response", (_req, res) => {
        reject(new Error(`/ws/pane unexpected response: ${res.statusCode}`));
      });
    });
    expect(snapshot).toEqual({ type: "pane.snapshot", data: "snapshot-B" });
    wsBus.close();
    wsPane.close();
  });
});
