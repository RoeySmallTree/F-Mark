import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerManagedAgentsRoutes } from "../../src/routes/managedAgents.js";
import { createServer } from "../../src/server.js";
import { initProject, readConfig } from "../../src/project.js";
import { paths } from "../../src/paths.js";
import { activePaths } from "../../src/paths/active.js";
import { globalPaths } from "../../src/paths/global.js";
import { PathContextRef } from "../../src/paths/contextRef.js";
import { createPresenceTracker } from "../../src/presence/tracker.js";
import { fakeCommandRunner } from "../../src/tmux/commandRunner.js";
import { createTmuxManager } from "../../src/tmux/manager.js";
import { createInputQueue } from "../../src/tmux/inputQueue.js";
import type { Bus, BusMessage } from "../../src/ws/bus.js";
import type { DetectResult } from "../../src/hooksInstall/types.js";
import { FMARK_LAUNCH_PROMPT_MARKER } from "../../src/launchPrompt.js";
import { createSession } from "../../src/sessions.js";
import { writeEventFile } from "../../src/events/writer.js";
import { serializeProse } from "../../src/events/prose.js";
import { readEvents } from "../../src/events/reader.js";

function fakeBus(): Bus & { messages: BusMessage[] } {
  const messages: BusMessage[] = [];
  return {
    messages,
    publish(msg: BusMessage) {
      messages.push(msg);
    },
  };
}

async function makeApp(opts?: {
  bus?: Bus;
  checkHookInstallStatus?: (o: {
    runtimeId: string;
    participantId: string;
    userParticipantId?: string;
    projectRoot?: string;
  }) => Promise<DetectResult>;
}) {
  const root = await mkdtemp(join(tmpdir(), "fmark-mgd-r-"));
  const p = paths(root);
  await initProject(p);
  const runner = fakeCommandRunner();
  const mgr = createTmuxManager({ runner, projectRoot: root });
  const tracker = createPresenceTracker({ broadcast: () => {} });
  const bus: Bus = opts?.bus ?? { publish: () => {} };
  const app = Fastify();
  // Phase 8 fix: input queue is shared at server scope. Per-test we still
  // create one for `registerManagedAgentsRoutes`; there's no parallel
  // /ws/pane wiring here so a private queue is fine for these tests.
  registerManagedAgentsRoutes(app, {
    paths: p,
    tmux: mgr,
    tracker,
    projectRoot: root,
    inputQueue: createInputQueue(),
    bus,
    checkHookInstallStatus: opts?.checkHookInstallStatus,
  });
  return { app, runner, root, p, tracker, cleanup: () => rm(root, { recursive: true, force: true }) };
}

function expectSpawnCalls(r: ReturnType<typeof fakeCommandRunner>) {
  r.expect(["tmux", "new-session"], { stdout: "", stderr: "", exitCode: 0 });
  r.expect(["tmux", "set-option"], { stdout: "", stderr: "", exitCode: 0 });
  r.expect(["tmux", "set-option"], { stdout: "", stderr: "", exitCode: 0 });
}

describe("POST /managed-agents/spawn", () => {
  it("creates participant, spawns tmux session, writes pointers, returns response shape", async () => {
    const { app, runner, p, tracker, cleanup } = await makeApp();
    expectSpawnCalls(runner);
    const res = await app.inject({
      method: "POST",
      url: "/managed-agents/spawn",
      payload: { runtime_id: "claude", suggested_participant_id: "ag-claude-test" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.participant_id).toBe("ag-claude-test");
    expect(body.tmux_session).toMatch(/-ag-ag-claude-test$/);
    expect(body.runtime_id).toBe("claude");

    // Participant got registered in config
    const cfg = await readConfig(p);
    expect(cfg.participants["ag-claude-test"]).toBeDefined();
    expect(cfg.participants["ag-claude-test"]!.kind).toBe("agent");

    // Sibling pointers written
    const tmuxFile = await readFile(
      join(p.fmarkDir(), "agents", "ag-claude-test", "tmux-session"),
      "utf8",
    );
    expect(tmuxFile).toBe(body.tmux_session);
    const runtimeFile = await readFile(
      join(p.fmarkDir(), "agents", "ag-claude-test", "runtime"),
      "utf8",
    );
    expect(runtimeFile).toBe("claude");

    // Tracker recorded a managed pane
    const snap = tracker.snapshot();
    expect(snap.has("ag-claude-test")).toBe(true);

    runner.verifyExpectationsConsumed();
    await app.close();
    await cleanup();
  });

  it("applies and persists launch access_mode when the runtime supports it", async () => {
    const { app, runner, p, cleanup } = await makeApp();
    expectSpawnCalls(runner);
    const res = await app.inject({
      method: "POST",
      url: "/managed-agents/spawn",
      payload: {
        runtime_id: "codex",
        suggested_participant_id: "ag-codex-access",
        access_mode: "never",
      },
    });
    expect(res.statusCode).toBe(200);
    const spawnCall = runner.calls.find((call) =>
      call[0] === "tmux" &&
      call[1] === "new-session" &&
      call.includes("codex"),
    );
    expect(spawnCall).toBeDefined();
    expect(spawnCall).toContain("-a");
    expect(spawnCall).toContain("never");
    const state = JSON.parse(
      await readFile(
        join(p.fmarkDir(), "agents", "ag-codex-access", "state.json"),
        "utf8",
      ),
    ) as { access_mode?: string };
    expect(state.access_mode).toBe("never");
    runner.verifyExpectationsConsumed();
    await app.close();
    await cleanup();
  });

  it("rejects unsupported launch access_mode before spawning", async () => {
    const { app, runner, cleanup } = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/managed-agents/spawn",
      payload: {
        runtime_id: "opencode",
        suggested_participant_id: "ag-opencode-access",
        access_mode: "never",
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("unsupported access_mode");
    runner.verifyExpectationsConsumed();
    await app.close();
    await cleanup();
  });

  it("writes active-session pointer when session_id provided", async () => {
    const { app, runner, p, cleanup } = await makeApp();
    const session = await createSession(p, { slug: "sess-abc" });
    expectSpawnCalls(runner);
    const res = await app.inject({
      method: "POST",
      url: "/managed-agents/spawn",
      payload: {
        runtime_id: "claude",
        suggested_participant_id: "ag-claude-sx",
        session_id: session.id,
      },
    });
    expect(res.statusCode).toBe(200);
    const active = await readFile(
      join(p.fmarkDir(), "agents", "ag-claude-sx", "active-session"),
      "utf8",
    );
    expect(active).toBe(session.id);
    // Response surfaces active_session so the renderer can scope the chip
    // strip without a /participants refetch.
    expect(res.json().active_session).toBe(session.id);
    runner.verifyExpectationsConsumed();
    await app.close();
    await cleanup();
  });

  it("404s before spawning when session_id does not exist", async () => {
    const { app, runner, p, cleanup } = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/managed-agents/spawn",
      payload: {
        runtime_id: "claude",
        suggested_participant_id: "ag-miss-sess",
        session_id: "definitely-not-real",
      },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toContain("session not found");
    const cfg = await readConfig(p);
    expect(cfg.participants["ag-miss-sess"]).toBeUndefined();
    runner.verifyExpectationsConsumed();
    await app.close();
    await cleanup();
  });

  it("writes managed state to the active path global bucket in multi-path mode", async () => {
    const fallbackRoot = await mkdtemp(join(tmpdir(), "fmark-mgd-fb-"));
    const activeRoot = await mkdtemp(join(tmpdir(), "fmark-mgd-active-"));
    const configRoot = await mkdtemp(join(tmpdir(), "fmark-mgd-cfg-"));
    try {
      const fallback = paths(fallbackRoot);
      const active = paths(activeRoot);
      await initProject(fallback);
      await initProject(active);
      const session = await createSession(active, { slug: "sess-global" });
      const activePath = activePaths(activeRoot);
      const g = globalPaths(configRoot);
      const ref = new PathContextRef({ global: g, active: activePath });
      const runner = fakeCommandRunner();
      const mgr = createTmuxManager({ runner, projectRoot: activeRoot });
      const tracker = createPresenceTracker({ broadcast: () => {} });
      const app = Fastify();
      registerManagedAgentsRoutes(app, {
        paths: fallback,
        tmux: mgr,
        tracker,
        projectRoot: activeRoot,
        inputQueue: createInputQueue(),
        bus: { publish: () => {} },
        pathContextRef: ref,
      });

      expectSpawnCalls(runner);
      const res = await app.inject({
        method: "POST",
        url: "/managed-agents/spawn",
        payload: {
          runtime_id: "claude",
          suggested_participant_id: "ag-cg",
          session_id: session.id,
        },
      });

      expect(res.statusCode).toBe(200);
      const primary = g.projectAgentsDir(activePath.pathId());
      expect(
        await readFile(
          join(primary, "ag-cg", "tmux-session"),
          "utf8",
        ),
      ).toBe(res.json().tmux_session);
      expect(await readFile(join(primary, "ag-cg", "runtime"), "utf8")).toBe(
        "claude",
      );
      expect(
        await readFile(
          join(primary, "ag-cg", "active-session"),
          "utf8",
        ),
      ).toBe(session.id);
      expect(
        await readFile(
          join(active.fmarkDir(), "agents", "ag-cg", "active-session"),
          "utf8",
        ),
      ).toBe(session.id);
      await expect(
        readFile(
          join(active.fmarkDir(), "agents", "ag-cg", "tmux-session"),
          "utf8",
        ),
      ).rejects.toThrow();

      runner.verifyExpectationsConsumed();
      await app.close();
    } finally {
      await rm(fallbackRoot, { recursive: true, force: true });
      await rm(activeRoot, { recursive: true, force: true });
      await rm(configRoot, { recursive: true, force: true });
    }
  });

  it("createServer initializes tmux against the active path when one exists", async () => {
    const fallbackRoot = await mkdtemp(join(tmpdir(), "fmark-mgd-fb-"));
    const activeRoot = await mkdtemp(join(tmpdir(), "fmark-mgd-active-"));
    const configRoot = await mkdtemp(join(tmpdir(), "fmark-mgd-cfg-"));
    try {
      const fallback = paths(fallbackRoot);
      const active = paths(activeRoot);
      await initProject(fallback);
      await initProject(active);
      const ref = new PathContextRef({
        global: globalPaths(configRoot),
        active: activePaths(activeRoot),
      });
      const runner = fakeCommandRunner();
      const { app } = createServer({
        token: null,
        paths: fallback,
        pathContextRef: ref,
        allowProcessApiNoAuth: true,
        commandRunner: runner,
      });

      expectSpawnCalls(runner);
      const res = await app.inject({
        method: "POST",
        url: "/managed-agents/spawn",
        payload: {
          runtime_id: "claude",
          suggested_participant_id: "ag-csr",
        },
      });

      expect(res.statusCode).toBe(200);
      const newSessionCall = runner.calls.find(
        (call) => call[0] === "tmux" && call[1] === "new-session",
      );
      expect(newSessionCall).toBeDefined();
      const cwdIndex = newSessionCall!.indexOf("-c");
      expect(newSessionCall![cwdIndex + 1]).toBe(activeRoot);
      runner.verifyExpectationsConsumed();
      await app.close();
    } finally {
      await rm(fallbackRoot, { recursive: true, force: true });
      await rm(activeRoot, { recursive: true, force: true });
      await rm(configRoot, { recursive: true, force: true });
    }
  });

  it("response active_session is null when spawn omits session_id", async () => {
    const { app, runner, cleanup } = await makeApp();
    expectSpawnCalls(runner);
    const res = await app.inject({
      method: "POST",
      url: "/managed-agents/spawn",
      payload: {
        runtime_id: "claude",
        suggested_participant_id: "ag-claude-ns",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().active_session).toBeNull();
    runner.verifyExpectationsConsumed();
    await app.close();
    await cleanup();
  });

  it("400 on unknown runtime", async () => {
    const { app, runner, cleanup } = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/managed-agents/spawn",
      payload: { runtime_id: "unknown" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/unknown runtime_id/);
    runner.verifyExpectationsConsumed();
    await app.close();
    await cleanup();
  });

  it("400 on invalid suggested_participant_id", async () => {
    const { app, runner, cleanup } = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/managed-agents/spawn",
      payload: { runtime_id: "claude", suggested_participant_id: "../etc" },
    });
    expect(res.statusCode).toBe(400);
    runner.verifyExpectationsConsumed();
    await app.close();
    await cleanup();
  });

  it("reuses participant when id already registered", async () => {
    const { app, runner, p, cleanup } = await makeApp();
    expectSpawnCalls(runner);
    const r1 = await app.inject({
      method: "POST",
      url: "/managed-agents/spawn",
      payload: { runtime_id: "claude", suggested_participant_id: "ag-claude-rb" },
    });
    expect(r1.statusCode).toBe(200);

    expectSpawnCalls(runner);
    const r2 = await app.inject({
      method: "POST",
      url: "/managed-agents/spawn",
      payload: { runtime_id: "claude", suggested_participant_id: "ag-claude-rb" },
    });
    expect(r2.statusCode).toBe(200);
    const cfg = await readConfig(p);
    expect(cfg.participants["ag-claude-rb"]).toBeDefined();
    runner.verifyExpectationsConsumed();
    await app.close();
    await cleanup();
  });

  it("rolls back tmux session when a post-spawn write fails", async () => {
    const { app, runner, p, cleanup } = await makeApp();
    // Sabotage the writeRuntime() target: pre-create
    // .f-mark/agents/<id>/runtime as a directory so writeFile throws EISDIR.
    const sabotagedId = "ag-rb-fail";
    await mkdir(join(p.fmarkDir(), "agents", sabotagedId, "runtime"), {
      recursive: true,
    });

    expectSpawnCalls(runner);
    // After the write fails, we expect a kill-session attempt to roll back.
    runner.expect(["tmux", "kill-session"], {
      stdout: "",
      stderr: "",
      exitCode: 0,
    });

    const res = await app.inject({
      method: "POST",
      url: "/managed-agents/spawn",
      payload: {
        runtime_id: "claude",
        suggested_participant_id: sabotagedId,
      },
    });
    // Surfaces as a 5xx because the write actually failed; the contract is
    // that tmux state was cleaned up before the error propagates.
    expect(res.statusCode).toBeGreaterThanOrEqual(500);
    // Verify all expected tmux calls (spawn + kill) were consumed —
    // the kill-session expectation proves the route rolled back.
    runner.verifyExpectationsConsumed();
    await app.close();
    await cleanup();
  });
});

describe("GET /managed-agents/:id/confirm-token", () => {
  it("returns a one-time token", async () => {
    const { app, cleanup } = await makeApp();
    const res = await app.inject({
      method: "GET",
      url: "/managed-agents/ag-claude/confirm-token",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().token).toMatch(/^[0-9a-f]{16}$/);
    await app.close();
    await cleanup();
  });

  it("400 on invalid id", async () => {
    const { app, cleanup } = await makeApp();
    const res = await app.inject({
      method: "GET",
      url: "/managed-agents/..%2Fetc/confirm-token",
    });
    expect(res.statusCode).toBe(400);
    await app.close();
    await cleanup();
  });
});

describe("DELETE /managed-agents/:id", () => {
  it("403 when no confirm token", async () => {
    const { app, cleanup } = await makeApp();
    const res = await app.inject({
      method: "DELETE",
      url: "/managed-agents/ag-claude",
    });
    expect(res.statusCode).toBe(403);
    await app.close();
    await cleanup();
  });

  it("403 when confirm token is wrong", async () => {
    const { app, cleanup } = await makeApp();
    const tok = await app.inject({
      method: "GET",
      url: "/managed-agents/ag-claude/confirm-token",
    });
    expect(tok.statusCode).toBe(200);
    const res = await app.inject({
      method: "DELETE",
      url: "/managed-agents/ag-claude?confirm=wrong",
    });
    expect(res.statusCode).toBe(403);
    await app.close();
    await cleanup();
  });

  it("200 with valid confirm; kills tmux + clears siblings; second use → 403 (stale)", async () => {
    const { app, runner, p, cleanup } = await makeApp();
    // Spawn first so siblings exist
    expectSpawnCalls(runner);
    const spawn = await app.inject({
      method: "POST",
      url: "/managed-agents/spawn",
      payload: { runtime_id: "claude", suggested_participant_id: "ag-claude-k" },
    });
    expect(spawn.statusCode).toBe(200);

    // Get confirm token
    const tok = await app.inject({
      method: "GET",
      url: "/managed-agents/ag-claude-k/confirm-token",
    });
    const token = tok.json().token as string;

    runner.expect(["tmux", "kill-session"], { stdout: "", stderr: "", exitCode: 0 });
    const res = await app.inject({
      method: "DELETE",
      url: `/managed-agents/ag-claude-k?confirm=${token}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    // Siblings cleared
    await expect(
      readFile(join(p.fmarkDir(), "agents", "ag-claude-k", "tmux-session"), "utf8"),
    ).rejects.toThrow();

    // Second use with the same token → 403 stale
    const res2 = await app.inject({
      method: "DELETE",
      url: `/managed-agents/ag-claude-k?confirm=${token}`,
    });
    expect(res2.statusCode).toBe(403);
    runner.verifyExpectationsConsumed();
    await app.close();
    await cleanup();
  });
});

describe("POST /managed-agents/terminal", () => {
  it("allocates sequential indices", async () => {
    const { app, runner, root, cleanup } = await makeApp();
    // First call: list returns empty → index 1
    runner.expect(["tmux", "ls"], { stdout: "", stderr: "", exitCode: 1 });
    runner.expect(["tmux", "new-session"], { stdout: "", stderr: "", exitCode: 0 });
    runner.expect(["tmux", "set-option"], { stdout: "", stderr: "", exitCode: 0 });

    const r1 = await app.inject({
      method: "POST",
      url: "/managed-agents/terminal",
      payload: {},
    });
    expect(r1.statusCode).toBe(200);
    expect(r1.json().tmux_session).toMatch(/-term-1$/);
    expect(r1.json().label).toBe("terminal 1");

    const firstSessionName = r1.json().tmux_session as string;

    // Second call: list returns first session
    runner.expect(["tmux", "ls"], {
      stdout: `${firstSessionName}\n`,
      stderr: "",
      exitCode: 0,
    });
    runner.expect(["tmux", "show-options"], {
      stdout: `${root}\n`,
      stderr: "",
      exitCode: 0,
    });
    runner.expect(["tmux", "new-session"], { stdout: "", stderr: "", exitCode: 0 });
    runner.expect(["tmux", "set-option"], { stdout: "", stderr: "", exitCode: 0 });
    const r2 = await app.inject({
      method: "POST",
      url: "/managed-agents/terminal",
      payload: { name: "shell" },
    });
    expect(r2.statusCode).toBe(200);
    expect(r2.json().tmux_session).toMatch(/-term-2$/);
    expect(r2.json().label).toBe("shell");
    runner.verifyExpectationsConsumed();
    await app.close();
    await cleanup();
  });
});

describe("GET /managed-agents", () => {
  it("returns agents + terminals buckets", async () => {
    const { app, runner, root, cleanup } = await makeApp();
    // Spawn an agent
    expectSpawnCalls(runner);
    const spawn = await app.inject({
      method: "POST",
      url: "/managed-agents/spawn",
      payload: { runtime_id: "claude", suggested_participant_id: "ag-claude-list" },
    });
    expect(spawn.statusCode).toBe(200);
    const agentSession = spawn.json().tmux_session as string;

    // Spawn a terminal
    runner.expect(["tmux", "ls"], { stdout: "", stderr: "", exitCode: 1 });
    runner.expect(["tmux", "new-session"], { stdout: "", stderr: "", exitCode: 0 });
    runner.expect(["tmux", "set-option"], { stdout: "", stderr: "", exitCode: 0 });
    const term = await app.inject({
      method: "POST",
      url: "/managed-agents/terminal",
      payload: {},
    });
    expect(term.statusCode).toBe(200);
    const termSession = term.json().tmux_session as string;

    // List: ls returns both, show-options confirms both
    runner.expect(["tmux", "ls"], {
      stdout: `${agentSession}\n${termSession}\n`,
      stderr: "",
      exitCode: 0,
    });
    runner.expect(["tmux", "show-options"], {
      stdout: `${root}\n`,
      stderr: "",
      exitCode: 0,
    });
    runner.expect(["tmux", "show-options"], {
      stdout: `${root}\n`,
      stderr: "",
      exitCode: 0,
    });
    const list = await app.inject({ method: "GET", url: "/managed-agents" });
    expect(list.statusCode).toBe(200);
    const body = list.json();
    expect(body.agents).toHaveLength(1);
    expect(body.agents[0].participant_id).toBe("ag-claude-list");
    expect(body.agents[0].tmux_session).toBe(agentSession);
    expect(body.agents[0].runtime_id).toBe("claude");
    expect(body.agents[0].alive).toBe(true);
    expect(body.terminals).toHaveLength(1);
    expect(body.terminals[0].tmux_session).toBe(termSession);
    runner.verifyExpectationsConsumed();
    await app.close();
    await cleanup();
  });

  it("marks an agent dir whose tmux session is gone as alive: false", async () => {
    const { app, runner, p, cleanup } = await makeApp();
    // Manually set up an agent directory: write tmux-session + runtime.
    // No corresponding tmux session exists in the runner — listFmarkSessions()
    // will return empty.
    const { writeTmuxSession, writeRuntime } = await import(
      "../../src/agents/managed.js"
    );
    const { join: joinPath2 } = await import("node:path");
    const agentsDir2 = joinPath2(p.fmarkDir(), "agents");
    await writeTmuxSession(
      agentsDir2,
      "ag-claude-stale",
      "fmark-test-12345678-ag-ag-claude-stale",
    );
    await writeRuntime(agentsDir2, "ag-claude-stale", "claude");

    // ls returns nothing — sessions list is empty.
    runner.expect(["tmux", "ls"], {
      stdout: "",
      stderr: "no sessions",
      exitCode: 1,
    });
    const list = await app.inject({ method: "GET", url: "/managed-agents" });
    expect(list.statusCode).toBe(200);
    const body = list.json();
    expect(body.agents).toHaveLength(1);
    expect(body.agents[0].participant_id).toBe("ag-claude-stale");
    expect(body.agents[0].tmux_session).toBe(
      "fmark-test-12345678-ag-ag-claude-stale",
    );
    expect(body.agents[0].runtime_id).toBe("claude");
    expect(body.agents[0].alive).toBe(false);
    runner.verifyExpectationsConsumed();
    await app.close();
    await cleanup();
  });
});

describe("GET /managed-agents/:id/logs", () => {
  it("returns appended log entries", async () => {
    const { app, runner, cleanup } = await makeApp();
    expectSpawnCalls(runner);
    const spawn = await app.inject({
      method: "POST",
      url: "/managed-agents/spawn",
      payload: { runtime_id: "claude", suggested_participant_id: "ag-claude-lg" },
    });
    expect(spawn.statusCode).toBe(200);
    const res = await app.inject({
      method: "GET",
      url: "/managed-agents/ag-claude-lg/logs?since=10",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.entries)).toBe(true);
    expect(body.entries.find((e: { event: string }) => e.event === "spawn")).toBeTruthy();
    runner.verifyExpectationsConsumed();
    await app.close();
    await cleanup();
  });

  it("400 on invalid id", async () => {
    const { app, cleanup } = await makeApp();
    const res = await app.inject({
      method: "GET",
      url: "/managed-agents/..%2Fetc/logs",
    });
    expect(res.statusCode).toBe(400);
    await app.close();
    await cleanup();
  });
});

describe("Bus publishing (managed-agent WS messages)", () => {
  it("POST /managed-agents/spawn publishes managed-agent.spawned", async () => {
    const bus = fakeBus();
    const { app, runner, p, cleanup } = await makeApp({ bus });
    const session = await createSession(p, { slug: "sess-bus" });
    expectSpawnCalls(runner);
    const res = await app.inject({
      method: "POST",
      url: "/managed-agents/spawn",
      payload: {
        runtime_id: "claude",
        suggested_participant_id: "ag-claude-bus",
        session_id: session.id,
      },
    });
    expect(res.statusCode).toBe(200);
    const spawned = bus.messages.find((m) => m.type === "managed-agent.spawned");
    expect(spawned).toBeDefined();
    expect(spawned).toMatchObject({
      type: "managed-agent.spawned",
      participant_id: "ag-claude-bus",
      runtime_id: "claude",
      active_session: session.id,
    });
    // tmux_session field should also be present (the route returns it)
    expect((spawned as { tmux_session: string }).tmux_session).toMatch(
      /-ag-ag-claude-bus$/,
    );
    runner.verifyExpectationsConsumed();
    await app.close();
    await cleanup();
  });

  it("DELETE /managed-agents/:id publishes managed-agent.killed", async () => {
    const bus = fakeBus();
    const { app, runner, cleanup } = await makeApp({ bus });
    // Spawn first
    expectSpawnCalls(runner);
    const spawn = await app.inject({
      method: "POST",
      url: "/managed-agents/spawn",
      payload: { runtime_id: "claude", suggested_participant_id: "ag-claude-kbus" },
    });
    expect(spawn.statusCode).toBe(200);
    // Get confirm token
    const tok = await app.inject({
      method: "GET",
      url: "/managed-agents/ag-claude-kbus/confirm-token",
    });
    const token = tok.json().token as string;
    runner.expect(["tmux", "kill-session"], { stdout: "", stderr: "", exitCode: 0 });
    const res = await app.inject({
      method: "DELETE",
      url: `/managed-agents/ag-claude-kbus?confirm=${token}`,
    });
    expect(res.statusCode).toBe(200);
    const killed = bus.messages.find((m) => m.type === "managed-agent.killed");
    expect(killed).toBeDefined();
    expect(killed).toMatchObject({
      type: "managed-agent.killed",
      participant_id: "ag-claude-kbus",
    });
    runner.verifyExpectationsConsumed();
    await app.close();
    await cleanup();
  });

  it("POST /managed-agents/terminal publishes managed-agent.terminal-spawned", async () => {
    const bus = fakeBus();
    const { app, runner, cleanup } = await makeApp({ bus });
    runner.expect(["tmux", "ls"], { stdout: "", stderr: "", exitCode: 1 });
    runner.expect(["tmux", "new-session"], { stdout: "", stderr: "", exitCode: 0 });
    runner.expect(["tmux", "set-option"], { stdout: "", stderr: "", exitCode: 0 });
    const res = await app.inject({
      method: "POST",
      url: "/managed-agents/terminal",
      payload: { name: "scratch" },
    });
    expect(res.statusCode).toBe(200);
    const term = bus.messages.find(
      (m) => m.type === "managed-agent.terminal-spawned",
    );
    expect(term).toBeDefined();
    expect(term).toMatchObject({
      type: "managed-agent.terminal-spawned",
      label: "scratch",
    });
    expect((term as { tmux_session: string }).tmux_session).toMatch(/-term-1$/);
    runner.verifyExpectationsConsumed();
    await app.close();
    await cleanup();
  });
});

describe("POST /managed-agents/spawn — hooks_status + launch prompt", () => {
  /** Rewrite .f-mark/runtimes.json so tests can make any tmux-fallback launch
      delivery inline. Claude itself should receive the first prompt natively. */
  async function setZeroDelayClaude(p: ReturnType<typeof paths>): Promise<void> {
    const { writeFile } = await import("node:fs/promises");
    const { join: pjoin } = await import("node:path");
    const txt = JSON.stringify(
      {
        version: "1.0",
        runtimes: {
          claude: {
            displayName: "Claude Code",
            executable: "claude",
            args: [],
            icon: "claude",
            readyDelayMs: 0,
          },
        },
      },
      null,
      2,
    );
    await writeFile(pjoin(p.fmarkDir(), "runtimes.json"), txt, "utf8");
  }

  it("returns hooks_status='installed' and passes Claude the launch prompt as native argv", async () => {
    const fakeCheck = async (): Promise<DetectResult> => ({
      installed: true,
      configPath: "~/.claude/settings.json",
      detectedEntries: [],
      expectedEntries: [],
    });
    const { app, runner, p, tracker, cleanup } = await makeApp({
      checkHookInstallStatus: fakeCheck,
    });
    await setZeroDelayClaude(p);
    const session = await createSession(p, { slug: "sess-x" });
    const cfg = await readConfig(p);
    const userId = Object.entries(cfg.participants).find(
      ([, participant]) => participant.kind === "user",
    )?.[0];
    expect(userId).toBeDefined();
    await writeEventFile(p, session.id, {
      participant_id: userId!,
      kind: "prose",
      ext: "md",
      contents: serializeProse({ content: "Please continue the active task." }),
    });
    expectSpawnCalls(runner);

    const res = await app.inject({
      method: "POST",
      url: "/managed-agents/spawn",
      payload: {
        runtime_id: "claude",
        suggested_participant_id: "ag-hk-ok",
        session_id: session.id,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().hooks_status).toBe("installed");
    const newSessionCall = runner.calls.find(
      (call) => call[0] === "tmux" && call[1] === "new-session",
    );
    expect(newSessionCall).toBeDefined();
    expect(newSessionCall).toContain("claude");
    expect(newSessionCall?.at(-1)).toContain(FMARK_LAUNCH_PROMPT_MARKER);
    expect(newSessionCall?.at(-1)).toContain("F-Mark agent onboarding");
    expect(newSessionCall?.at(-1)).toContain("Existing Session Brief");
    expect(newSessionCall?.at(-1)).toContain("joining an existing F-Mark session");
    expect(newSessionCall?.at(-1)).toContain("Please continue the active task.");
    expect(newSessionCall?.at(-1)).toContain(session.id);
    expect(newSessionCall?.at(-1)).toContain("ag-hk-ok");
    expect(newSessionCall?.at(-1)).toContain('"hooks_status": "installed"');
    expect(
      runner.calls.some((call) => call[0] === "tmux" && call[1] === "send-keys"),
    ).toBe(false);
    // Tracker should reflect hooks installed.
    const snap = tracker.snapshot();
    const entry = snap.get("ag-hk-ok");
    expect(entry).toBeDefined();
    // After ping=null + hooksInstalled=true + paneAlive=true,
    // deriveState() will yield "launching" (no ping yet).
    expect(entry?.state).toBe("launching");
    runner.verifyExpectationsConsumed();
    await app.close();
    await cleanup();
  });

  it("returns hooks_status='missing' and does not send a fallback kickoff", async () => {
    const fakeCheck = async (): Promise<DetectResult> => ({
      installed: false,
      configPath: "~/.claude/settings.json",
      detectedEntries: [],
      expectedEntries: [
        {
          event: "Stop",
          command: "f-mark hook auto-stream ag-hk-no",
        },
      ],
    });
    const { app, runner, p, cleanup } = await makeApp({
      checkHookInstallStatus: fakeCheck,
    });
    await setZeroDelayClaude(p);
    expectSpawnCalls(runner);
    // No fallback send-keys expected.

    const res = await app.inject({
      method: "POST",
      url: "/managed-agents/spawn",
      payload: {
        runtime_id: "claude",
        suggested_participant_id: "ag-hk-no",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().hooks_status).toBe("missing");
    runner.verifyExpectationsConsumed();
    await app.close();
    await cleanup();
  });

  it("returns hooks_status='not_required' and seeds stale presence when the runtime has no hook entries", async () => {
    const fakeCheck = async (): Promise<DetectResult> => ({
      installed: false,
      configPath: "(manual-stream mode — no hooks needed in v0.4)",
      detectedEntries: [],
      expectedEntries: [],
    });
    const { app, runner, p, tracker, cleanup } = await makeApp({
      checkHookInstallStatus: fakeCheck,
    });
    await setZeroDelayClaude(p);
    expectSpawnCalls(runner);

    const res = await app.inject({
      method: "POST",
      url: "/managed-agents/spawn",
      payload: {
        runtime_id: "claude",
        suggested_participant_id: "ag-hk-manual",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().hooks_status).toBe("not_required");
    expect(tracker.snapshot().get("ag-hk-manual")?.state).toBe("stale");
    runner.verifyExpectationsConsumed();
    await app.close();
    await cleanup();
  });

  it("projects a terminal approval prompt into the chat and responds with the selected provider option", async () => {
    const fakeCheck = async (): Promise<DetectResult> => ({
      installed: false,
      configPath: "(manual-stream mode)",
      detectedEntries: [],
      expectedEntries: [],
    });
    const bus = fakeBus();
    const { app, runner, p, cleanup } = await makeApp({
      bus,
      checkHookInstallStatus: fakeCheck,
    });
    await setZeroDelayClaude(p);
    const session = await createSession(p, { slug: "terminal-approval" });
    expectSpawnCalls(runner);

    const spawn = await app.inject({
      method: "POST",
      url: "/managed-agents/spawn",
      payload: {
        runtime_id: "claude",
        suggested_participant_id: "ag-terminal",
        session_id: session.id,
      },
    });
    expect(spawn.statusCode).toBe(200);
    const tmuxSession = spawn.json().tmux_session as string;
    const cfg = await readConfig(p);
    const userId = Object.entries(cfg.participants).find(
      ([, participant]) => participant.kind === "user",
    )?.[0];
    expect(userId).toBeDefined();
    const terminalPrompt = [
      "Bash command",
      "ls /tmp && timeout 10 ./node_modules/.bin/tsx src/index.ts mcp",
      "Do you want to proceed?",
      "› 1. Yes",
      "  2. Yes, and allow access to .bin/ and timeout 10 commands",
      "  3. No",
    ].join("\n");

    runner.expect(["tmux", "display-message"], {
      stdout: "0\n",
      stderr: "",
      exitCode: 0,
    });
    runner.expect(["tmux", "capture-pane"], {
      stdout: terminalPrompt,
      stderr: "",
      exitCode: 0,
    });
    runner.expect(["tmux", "ls"], {
      stdout: `${tmuxSession}\n`,
      stderr: "",
      exitCode: 0,
    });
    runner.expect(["tmux", "show-options"], {
      stdout: `${p.root()}\n`,
      stderr: "",
      exitCode: 0,
    });

    await new Promise((resolve) => setTimeout(resolve, 1100));

    const request = (await readEvents(p, session.id, { kinds: ["access-request"] }))
      .find((event) => event.kind === "access-request");
    expect(request).toBeDefined();
    expect(request?.participant_id).toBe("ag-terminal");
    expect(request?.payload).toMatchObject({
      response_channel: "terminal",
      hook_event_name: "TerminalPermissionPrompt",
      command: expect.stringContaining("timeout 10"),
      suggestions: [
        expect.objectContaining({ id: "terminal:1", terminal_input: "1" }),
        expect.objectContaining({ id: "terminal:2", terminal_input: "2" }),
        expect.objectContaining({ id: "terminal:3", terminal_input: "3" }),
      ],
    });
    expect(
      bus.messages.some((message) => message.type === "event_added"),
    ).toBe(true);

    runner.expect(["tmux", "ls"], {
      stdout: `${tmuxSession}\n`,
      stderr: "",
      exitCode: 0,
    });
    runner.expect(["tmux", "show-options"], {
      stdout: `${p.root()}\n`,
      stderr: "",
      exitCode: 0,
    });
    runner.expect(["tmux", "send-keys", "-t", tmuxSession, "-l"], {
      stdout: "",
      stderr: "",
      exitCode: 0,
    });
    runner.expect(["tmux", "send-keys", "-t", tmuxSession, "--", "C-m"], {
      stdout: "",
      stderr: "",
      exitCode: 0,
    });
    runner.expect(["tmux", "ls"], {
      stdout: `${tmuxSession}\n`,
      stderr: "",
      exitCode: 0,
    });
    runner.expect(["tmux", "show-options"], {
      stdout: `${p.root()}\n`,
      stderr: "",
      exitCode: 0,
    });

    const response = await app.inject({
      method: "POST",
      url: `/managed-agents/ag-terminal/access-requests/${encodeURIComponent(
        (request!.payload as { request_id: string }).request_id,
      )}/respond`,
      payload: {
        session_id: session.id,
        participant_id: userId!,
        decision: "approve",
        option_id: "terminal:2",
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      delivered: true,
      delivery: "terminal",
      status: "approved",
    });
    expect(
      runner.calls.some((call) => call.includes("2")),
    ).toBe(true);
    const accessResponse = (await readEvents(p, session.id, {
      kinds: ["access-response"],
    })).find((event) => event.kind === "access-response");
    expect(accessResponse?.payload).toMatchObject({
      option_id: "terminal:2",
      terminal_input: "2",
      delivery: "terminal",
    });

    runner.verifyExpectationsConsumed();
    await app.close();
    await cleanup();
  });
});

describe("POST /managed-agents/preflight", () => {
  it("blocks Opencode when the runtime registry would reject spawn", async () => {
    const { app, p, cleanup } = await makeApp();
    const { writeFile } = await import("node:fs/promises");
    const { join: pjoin } = await import("node:path");
    await writeFile(
      pjoin(p.fmarkDir(), "runtimes.json"),
      JSON.stringify(
        {
          version: "1.0",
          runtimes: {
            claude: {
              displayName: "Claude Code",
              executable: "claude",
              args: [],
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const res = await app.inject({
      method: "POST",
      url: "/managed-agents/preflight",
      payload: { runtime_id: "opencode", participant_id: "ag-opencode-x" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.runtime.available).toBe(false);
    expect(body.runtime.reason).toContain("not registered");
    expect(body.mcp.status).toBe("blocked");
    expect(body.hooks.status).toBe("blocked");
    expect(body.can_apply).toBe(false);
    await app.close();
    await cleanup();
  });
});
