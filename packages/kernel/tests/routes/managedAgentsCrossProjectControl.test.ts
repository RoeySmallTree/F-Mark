import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerManagedAgentsRoutes } from "../../src/routes/managedAgents.js";
import { initProject } from "../../src/project.js";
import { paths } from "../../src/paths.js";
import { activePaths } from "../../src/paths/active.js";
import { globalPaths } from "../../src/paths/global.js";
import { PathContextRef } from "../../src/paths/contextRef.js";
import { registerProjectPath } from "../../src/paths/registry.js";
import { createPresenceTracker } from "../../src/presence/tracker.js";
import { writeTmuxSession, writeRuntime } from "../../src/agents/managed.js";
import { writeActiveSession } from "../../src/agents/activeSession.js";
import { registerAgent } from "../../src/participants.js";
import { createSession } from "../../src/sessions.js";
import { createInputQueue } from "../../src/tmux/inputQueue.js";
import type { BusMessage } from "../../src/ws/bus.js";
import type { TmuxManager } from "../../src/tmux/manager.js";

interface FakeCall {
  method: string;
  args: unknown[];
}

interface FakeTmux extends TmuxManager {
  calls: FakeCall[];
}

function fakeTmux(liveSessions: string[] = []): FakeTmux {
  const calls: FakeCall[] = [];
  const mgr: Partial<TmuxManager> & { calls: FakeCall[] } = {
    calls,
    spawnAgent: async (input: unknown) => {
      calls.push({ method: "spawnAgent", args: [input] });
      return { sessionName: "fmark-bg-respawn-ag-ag-claude" };
    },
    spawnTerminal: async () => ({ sessionName: "fake-term" }),
    listFmarkSessions: async () =>
      liveSessions.map((sessionName) => ({
        sessionName,
        kind: "agent" as const,
        index: null,
      })),
    killSession: async (id: string) => {
      calls.push({ method: "killSession", args: [id] });
    },
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

/* Active root A + background root B, both known (B via the project registry).
   An agent's pane lives ONLY in B. Control routes must resolve B from the
   request's path_id/root rather than the active (A) agent store. */
async function makeCrossProjectApp(options: { liveBgSession?: boolean } = {}) {
  const activeRoot = await mkdtemp(join(tmpdir(), "fmark-xp-active-"));
  const backgroundRoot = await mkdtemp(join(tmpdir(), "fmark-xp-bg-"));
  const configRoot = await mkdtemp(join(tmpdir(), "fmark-xp-cfg-"));
  const active = paths(activeRoot);
  const background = paths(backgroundRoot);
  await initProject(active);
  await initProject(background);
  const g = globalPaths(configRoot);
  await registerProjectPath(g, backgroundRoot);
  const backgroundPath = activePaths(backgroundRoot);
  const backgroundPathId = backgroundPath.pathId();
  const ref = new PathContextRef({
    global: g,
    active: activePaths(activeRoot),
  });

  // The agent is a registered participant of the BACKGROUND project (so its
  // status row builds) whose pane pointers live in B's global agent bucket —
  // the same place createAgentStateStoreForRoot(backgroundRoot, g) reads from.
  await registerAgent(background, { name: "Claude", suggested_id: "ag-claude" });
  const bgAgentsDir = g.projectAgentsDir(backgroundPathId);
  const bgSession = "fmark-bg-12345678-ag-ag-claude";
  await writeTmuxSession(bgAgentsDir, "ag-claude", bgSession);
  await writeRuntime(bgAgentsDir, "ag-claude", "claude");

  const tmux = fakeTmux(options.liveBgSession === true ? [bgSession] : []);
  const tracker = createPresenceTracker({ broadcast: () => {} });
  const published: BusMessage[] = [];
  const app = Fastify();
  registerManagedAgentsRoutes(app, {
    paths: active,
    tmux,
    tracker,
    projectRoot: activeRoot,
    inputQueue: createInputQueue(),
    bus: { publish: (m: BusMessage) => published.push(m) },
    pathContextRef: ref,
  });
  return {
    app,
    tmux,
    published,
    background,
    bgAgentsDir,
    backgroundRoot,
    backgroundPathId,
    bgSession,
    cleanup: async () => {
      await rm(activeRoot, { recursive: true, force: true });
      await rm(backgroundRoot, { recursive: true, force: true });
      await rm(configRoot, { recursive: true, force: true });
    },
  };
}

describe("per-agent control routes are root-scoped (cross-project)", () => {
  it("interrupt with path_id targets the background-root pane (not 409)", async () => {
    const { app, tmux, backgroundPathId, bgSession, cleanup } =
      await makeCrossProjectApp();
    const res = await app.inject({
      method: "POST",
      url: "/managed-agents/ag-claude/command",
      payload: { type: "interrupt", path_id: backgroundPathId },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    const cc = tmux.calls.find(
      (x) => x.method === "sendKey" && x.args[1] === "C-c",
    );
    expect(cc).toBeDefined();
    expect(cc?.args[0]).toBe(bgSession);
    await app.close();
    await cleanup();
  });

  it("interrupt with root targets the background-root pane", async () => {
    const { app, tmux, backgroundRoot, bgSession, cleanup } =
      await makeCrossProjectApp();
    const res = await app.inject({
      method: "POST",
      url: "/managed-agents/ag-claude/command",
      payload: { type: "interrupt", root: backgroundRoot },
    });
    expect(res.statusCode).toBe(200);
    const cc = tmux.calls.find(
      (x) => x.method === "sendKey" && x.args[1] === "C-c",
    );
    expect(cc?.args[0]).toBe(bgSession);
    await app.close();
    await cleanup();
  });

  it("interrupt turn-end is published with the background root's pathId", async () => {
    const { app, background, bgAgentsDir, backgroundPathId, published, cleanup } =
      await makeCrossProjectApp();
    const session = await createSession(background, { slug: "bg-run" });
    await writeActiveSession(bgAgentsDir, "ag-claude", session.id);

    const res = await app.inject({
      method: "POST",
      url: "/managed-agents/ag-claude/command",
      payload: { type: "interrupt", path_id: backgroundPathId },
    });
    expect(res.statusCode).toBe(200);

    const turnEnd = published.find(
      (m) =>
        m.type === "event_added" &&
        m.kind === "turn-end" &&
        m.participant_id === "ag-claude" &&
        m.session_id === session.id,
    );
    expect(turnEnd).toBeDefined();
    // Routes the turn-end to the background project's tab, not the active one.
    expect((turnEnd as { pathId?: string }).pathId).toBe(backgroundPathId);
    await app.close();
    await cleanup();
  });

  it("interrupt WITHOUT scope falls back to active and 409s (agent not in active root)", async () => {
    const { app, cleanup } = await makeCrossProjectApp();
    const res = await app.inject({
      method: "POST",
      url: "/managed-agents/ag-claude/command",
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

  it("say goodbye with path_id kills the background-root pane", async () => {
    const { app, tmux, backgroundPathId, bgSession, published, cleanup } =
      await makeCrossProjectApp();
    const tokenRes = await app.inject({
      method: "GET",
      url: "/managed-agents/ag-claude/confirm-token",
    });
    const token = tokenRes.json().token as string;
    const res = await app.inject({
      method: "DELETE",
      url: `/managed-agents/ag-claude?confirm=${encodeURIComponent(token)}&path_id=${encodeURIComponent(backgroundPathId)}`,
    });
    expect(res.statusCode).toBe(200);
    const kill = tmux.calls.find((x) => x.method === "killSession");
    expect(kill).toBeDefined();
    expect(kill?.args[0]).toBe(bgSession);
    const killed = published.find((m) => m.type === "managed-agent.killed") as
      | { pathId?: string; revision?: number }
      | undefined;
    expect(killed).toBeDefined();
    // Background root: carry its pathId, but NO active revision (so active tabs
    // ignore it and the matching background tab keeps it).
    expect(killed?.pathId).toBe(backgroundPathId);
    expect(killed?.revision).toBeUndefined();
    await app.close();
    await cleanup();
  });

  it("pause with path_id records to the background-root agent", async () => {
    const { app, backgroundPathId, cleanup } = await makeCrossProjectApp();
    const res = await app.inject({
      method: "POST",
      url: "/managed-agents/ag-claude/pause",
      payload: { path_id: backgroundPathId },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().agent?.participant_id).toBe("ag-claude");
    await app.close();
    await cleanup();
  });

  it("GET /managed-agents/status with path_id lists the background-root agent", async () => {
    const { app, backgroundPathId, cleanup } = await makeCrossProjectApp();
    // Active scope (default) does not see the background agent…
    const active = await app.inject({
      method: "GET",
      url: "/managed-agents/status",
    });
    expect(active.statusCode).toBe(200);
    expect(
      active.json().agents.some((a: { participant_id: string }) => a.participant_id === "ag-claude"),
    ).toBe(false);
    // …but the scoped status does. Without this, a control mutation's follow-up
    // refresh would clear the background rows.
    const scoped = await app.inject({
      method: "GET",
      url: `/managed-agents/status?path_id=${encodeURIComponent(backgroundPathId)}`,
    });
    expect(scoped.statusCode).toBe(200);
    expect(
      scoped.json().agents.some((a: { participant_id: string }) => a.participant_id === "ag-claude"),
    ).toBe(true);
    await app.close();
    await cleanup();
  });

  it("GET /managed-agents with path_id reads tmux state from the background root", async () => {
    const { app, backgroundPathId, bgSession, cleanup } =
      await makeCrossProjectApp({ liveBgSession: true });
    const active = await app.inject({
      method: "GET",
      url: "/managed-agents",
    });
    expect(active.statusCode).toBe(200);
    expect(
      active
        .json()
        .agents.some(
          (a: { participant_id: string }) => a.participant_id === "ag-claude",
        ),
    ).toBe(false);

    const scoped = await app.inject({
      method: "GET",
      url: `/managed-agents?path_id=${encodeURIComponent(backgroundPathId)}`,
    });
    expect(scoped.statusCode).toBe(200);
    const agent = scoped
      .json()
      .agents.find(
        (a: { participant_id: string }) => a.participant_id === "ag-claude",
      );
    expect(agent).toMatchObject({
      participant_id: "ag-claude",
      tmux_session: bgSession,
      alive: true,
      runtime_id: "claude",
    });
    await app.close();
    await cleanup();
  });

  it("runtime-state writes and reads are isolated by path_id", async () => {
    const { app, backgroundPathId, cleanup } = await makeCrossProjectApp();
    const unscoped = await app.inject({
      method: "GET",
      url: "/managed-agents/ag-claude/runtime/state",
    });
    expect(unscoped.statusCode).toBe(200);
    expect(unscoped.json().state).toBeNull();

    const post = await app.inject({
      method: "POST",
      url: "/managed-agents/ag-claude/runtime-state",
      payload: {
        path_id: backgroundPathId,
        model: "claude-bg-model",
        provider: "anthropic",
        source: "hook",
        observedAt: 1234,
      },
    });
    expect(post.statusCode, post.body).toBe(200);

    const stillUnscoped = await app.inject({
      method: "GET",
      url: "/managed-agents/ag-claude/runtime/state",
    });
    expect(stillUnscoped.statusCode).toBe(200);
    expect(stillUnscoped.json().state).toBeNull();

    const scoped = await app.inject({
      method: "GET",
      url: `/managed-agents/ag-claude/runtime/state?path_id=${encodeURIComponent(backgroundPathId)}`,
    });
    expect(scoped.statusCode).toBe(200);
    expect(scoped.json().state).toMatchObject({
      model: "claude-bg-model",
      provider: "anthropic",
      source: "hook",
      observedAt: 1234,
    });
    await app.close();
    await cleanup();
  });

  it("reconnect spawns the pane in the agent's own (background) project root", async () => {
    const { app, tmux, backgroundRoot, backgroundPathId, cleanup } =
      await makeCrossProjectApp();
    const res = await app.inject({
      method: "POST",
      url: "/managed-agents/ag-claude/reconnect",
      payload: { path_id: backgroundPathId },
    });
    expect(res.statusCode).toBe(200);
    const spawn = tmux.calls.find((x) => x.method === "spawnAgent");
    expect(spawn).toBeDefined();
    // The respawned pane must be rooted in the background project — otherwise
    // it lands in the active project while the session pointer is written to
    // the background root, and scoped status can never see it.
    expect((spawn?.args[0] as { projectRoot?: string }).projectRoot).toBe(
      backgroundRoot,
    );
    await app.close();
    await cleanup();
  });
});
