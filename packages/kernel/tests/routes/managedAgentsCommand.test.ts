import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerManagedAgentsRoutes } from "../../src/routes/managedAgents.js";
import { initProject } from "../../src/project.js";
import { paths } from "../../src/paths.js";
import { createPresenceTracker } from "../../src/presence/tracker.js";
import { writeTmuxSession } from "../../src/agents/managed.js";
import { createInputQueue } from "../../src/tmux/inputQueue.js";
import type { TmuxManager } from "../../src/tmux/manager.js";

interface FakeCall {
  method: string;
  args: unknown[];
}

interface FakeTmux extends TmuxManager {
  calls: FakeCall[];
}

function fakeTmux(): FakeTmux {
  const calls: FakeCall[] = [];
  const mgr: Partial<TmuxManager> & { calls: FakeCall[] } = {
    calls,
    spawnAgent: async () => ({ sessionName: "fake-session" }),
    spawnTerminal: async () => ({ sessionName: "fake-term" }),
    listFmarkSessions: async () => [],
    killSession: async () => {},
    captureSnapshot: async () => "",
    startPipePane: async () => {},
    stopPipePane: async () => {},
    sendKey: async (id: string, key: string) => {
      calls.push({ method: "sendKey", args: [id, key] });
    },
    sendLiteralText: async (id: string, text: string) => {
      calls.push({ method: "sendLiteralText", args: [id, text] });
    },
    resize: async () => {},
    paneAlive: async () => true,
    getVersion: async () => null,
    getUserOption: async () => null,
  };
  return mgr as FakeTmux;
}

async function makeApp() {
  const root = await mkdtemp(join(tmpdir(), "fmark-cmd-"));
  const p = paths(root);
  await initProject(p);
  await writeTmuxSession(
    p.fmarkDir(),
    "ag-claude",
    "fmark-test-12345678-ag-ag-claude",
  );
  const tmux = fakeTmux();
  const tracker = createPresenceTracker({ broadcast: () => {} });
  const app = Fastify();
  registerManagedAgentsRoutes(app, {
    paths: p,
    tmux,
    tracker,
    projectRoot: root,
    inputQueue: createInputQueue(),
    bus: { publish: () => {} },
  });
  return {
    app,
    tmux,
    root,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

describe("POST /managed-agents/:id/command", () => {
  it("interrupt -> sends C-c via input queue", async () => {
    const { app, tmux, cleanup } = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/managed-agents/ag-claude/command",
      payload: { type: "interrupt" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    const c = tmux.calls.find(
      (x) => x.method === "sendKey" && x.args[1] === "C-c",
    );
    expect(c).toBeDefined();
    expect(c?.args[0]).toBe("fmark-test-12345678-ag-ag-claude");
    await app.close();
    await cleanup();
  });

  it("slash compact -> sends /compact then C-m", async () => {
    const { app, tmux, cleanup } = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/managed-agents/ag-claude/command",
      payload: { type: "slash", command: "compact" },
    });
    expect(res.statusCode).toBe(200);
    const lit = tmux.calls.find((x) => x.method === "sendLiteralText");
    expect(lit?.args[1]).toBe("/compact");
    const enter = tmux.calls.find(
      (x) => x.method === "sendKey" && x.args[1] === "C-m",
    );
    expect(enter).toBeDefined();
    // Order: literal text first, then Enter
    const litIdx = tmux.calls.indexOf(lit!);
    const enterIdx = tmux.calls.indexOf(enter!);
    expect(litIdx).toBeLessThan(enterIdx);
    await app.close();
    await cleanup();
  });

  it("message -> sends literal text + C-m", async () => {
    const { app, tmux, cleanup } = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/managed-agents/ag-claude/command",
      payload: { type: "message", text: "hello there" },
    });
    expect(res.statusCode).toBe(200);
    const lit = tmux.calls.find(
      (x) => x.method === "sendLiteralText" && x.args[1] === "hello there",
    );
    expect(lit).toBeDefined();
    const enter = tmux.calls.find(
      (x) => x.method === "sendKey" && x.args[1] === "C-m",
    );
    expect(enter).toBeDefined();
    await app.close();
    await cleanup();
  });

  it("unmanaged participant -> 409 with overlay offer", async () => {
    const { app, cleanup } = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/managed-agents/ag-no-such/command",
      payload: { type: "interrupt" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      reason: "unmanaged_pane",
      offer: "open_overlay",
    });
    await app.close();
    await cleanup();
  });

  it("slash with bad command name -> 400", async () => {
    const { app, tmux, cleanup } = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/managed-agents/ag-claude/command",
      payload: { type: "slash", command: "1bad" },
    });
    expect(res.statusCode).toBe(400);
    // No literal text or Enter should be sent
    expect(tmux.calls.find((x) => x.method === "sendLiteralText")).toBeUndefined();
    expect(
      tmux.calls.find((x) => x.method === "sendKey" && x.args[1] === "C-m"),
    ).toBeUndefined();
    await app.close();
    await cleanup();
  });

  it("message with control char -> 400", async () => {
    const { app, tmux, cleanup } = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/managed-agents/ag-claude/command",
      payload: { type: "message", text: "hello\nworld" },
    });
    expect(res.statusCode).toBe(400);
    expect(tmux.calls.find((x) => x.method === "sendLiteralText")).toBeUndefined();
    await app.close();
    await cleanup();
  });

  it("unknown type -> 400", async () => {
    const { app, cleanup } = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/managed-agents/ag-claude/command",
      payload: { type: "unknown" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
    await cleanup();
  });
});
