import { expect, it } from "vitest";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createServer } from "../../../src/server.js";
import { readConfig } from "../../../src/project.js";
import { globalPaths, resolveConfigRoot } from "../../../src/paths/global.js";
import { createSession } from "../../../src/sessions.js";
import { createAgentStateStore } from "../../../src/services/agentState.js";
import { readGlobalConfig } from "../../../src/state/globalConfig.js";
import { fakeCommandRunner } from "../../../src/tmux/commandRunner.js";
import {
  expectNewSessionCwd,
  expectSpawnCalls,
  fakeBus,
  getNewSessionCall,
  makeApp,
  type FakeRunner,
} from "./fixtures.js";
import {
  makeScopedManagedAgentsApp,
  withActivePathFixture,
  withBackgroundPathFixture,
} from "./scopedPaths.js";

export function registerSpawnTests(): void {
  it(
    "creates participant, spawns tmux session, writes pointers, returns response shape",
    createsParticipantAndPointers,
  );
  it(
    "applies and persists launch access_mode when the runtime supports it",
    appliesLaunchAccessMode,
  );
  it(
    "applies launch model and effort and remembers them as provider defaults",
    appliesLaunchModelEffortAndPersistsDefaults,
  );
  it(
    "applies and persists opencode skip-permissions launch access_mode",
    appliesOpencodeLaunchAccessMode,
  );
  it(
    "rejects unsupported launch access_mode before spawning",
    rejectsUnsupportedLaunchAccessMode,
  );
  it("writes active-session pointer when session_id provided", writesActiveSessionPointer);
  it("404s before spawning when session_id does not exist", rejectsMissingSession);
  it(
    "writes managed state to the active path global bucket in multi-path mode",
    writesManagedStateToActivePathGlobalBucket,
  );
  it(
    "spawns into a scoped background root when path_id is provided",
    spawnsIntoScopedBackgroundRoot,
  );
  it(
    "createServer initializes tmux against the active path when one exists",
    createServerInitializesTmuxAgainstActivePath,
  );
  it("response active_session is null when spawn omits session_id", nullActiveSession);
  it("400 on unknown runtime", rejectsUnknownRuntime);
  it("400 on invalid suggested_participant_id", rejectsInvalidSuggestedId);
  it("reuses participant when id already registered", reusesRegisteredParticipant);
  it("rolls back tmux session when a post-spawn write fails", rollsBackTmuxOnWriteFailure);
  it(
    "409s a duplicate spawn for the same runtime while one is in flight",
    rejectsConcurrentDuplicateSpawn,
  );
}

async function createsParticipantAndPointers(): Promise<void> {
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

  const cfg = await readConfig(p);
  expect(cfg.participants["ag-claude-test"]).toBeDefined();
  expect(cfg.participants["ag-claude-test"]!.kind).toBe("agent");

  const agentDir = join(p.fmarkDir(), "agents", "ag-claude-test");
  expect(await readFile(join(agentDir, "tmux-session"), "utf8")).toBe(
    body.tmux_session,
  );
  expect(await readFile(join(agentDir, "runtime"), "utf8")).toBe("claude");
  expect(tracker.snapshot().has("ag-claude-test")).toBe(true);

  runner.verifyExpectationsConsumed();
  await app.close();
  await cleanup();
}

async function appliesLaunchAccessMode(): Promise<void> {
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
  expectCodexAccessModeSpawn(runner);
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
}

async function appliesLaunchModelEffortAndPersistsDefaults(): Promise<void> {
  const { app, runner, root, p, cleanup } = await makeApp();
  expectSpawnCalls(runner);
  const res = await app.inject({
    method: "POST",
    url: "/managed-agents/spawn",
    payload: {
      runtime_id: "claude",
      suggested_participant_id: "ag-claude-model",
      model: "opus",
      effort: "high",
      access_mode: "plan",
    },
  });

  expect(res.statusCode).toBe(200);
  const cfg = await readConfig(p);
  expect(cfg.participants["ag-claude-model"]).toMatchObject({
    model_override: "opus",
    effort_override: "high",
  });
  const spawnCall = getNewSessionCall(runner);
  expectArgPair(spawnCall, "--model", "opus");
  expectArgPair(spawnCall, "--effort", "high");
  await expect(readGlobalConfig(testGlobalPaths(root))).resolves.toMatchObject({
    integrations: {
      claude: {
        model: "opus",
        effort: "high",
        access_mode: "plan",
      },
    },
  });
  runner.verifyExpectationsConsumed();
  await app.close();
  await cleanup();
}

async function appliesOpencodeLaunchAccessMode(): Promise<void> {
  const { app, runner, p, cleanup } = await makeApp();
  expectSpawnCalls(runner);
  const res = await app.inject({
    method: "POST",
    url: "/managed-agents/spawn",
    payload: {
      runtime_id: "opencode",
      suggested_participant_id: "ag-opencode-access",
      access_mode: "dangerously-skip-permissions",
    },
  });
  expect(res.statusCode).toBe(200);
  expectOpencodeAccessModeSpawn(runner);
  const state = JSON.parse(
    await readFile(
      join(p.fmarkDir(), "agents", "ag-opencode-access", "state.json"),
      "utf8",
    ),
  ) as { access_mode?: string };
  expect(state.access_mode).toBe("dangerously-skip-permissions");
  runner.verifyExpectationsConsumed();
  await app.close();
  await cleanup();
}

function expectArgPair(args: string[], flag: string, value: string): void {
  const index = args.indexOf(flag);
  expect(index).toBeGreaterThanOrEqual(0);
  expect(args[index + 1]).toBe(value);
}

function testGlobalPaths(root: string) {
  return globalPaths(
    resolveConfigRoot({
      ...process.env,
      HOME: join(root, "home"),
    }),
  );
}

function expectCodexAccessModeSpawn(runner: FakeRunner): void {
  const spawnCall = runner.calls.find((call) =>
    call[0] === "tmux" && call[1] === "new-session" && call.includes("codex"),
  );
  expect(spawnCall).toBeDefined();
  expect(spawnCall).toContain("-a");
  expect(spawnCall).toContain("never");
  expect(spawnCall).toContain(
    'mcp_servers.fmark.tools.fmark_post_prose.approval_mode="approve"',
  );
  expect(spawnCall).toContain(
    'mcp_servers.fmark.tools.fmark_end_turn.approval_mode="approve"',
  );
}

function expectOpencodeAccessModeSpawn(runner: FakeRunner): void {
  const spawnCall = runner.calls.find((call) =>
    call[0] === "tmux" && call[1] === "new-session" && call.includes("opencode"),
  );
  expect(spawnCall).toBeDefined();
  expect(spawnCall).toContain("--dangerously-skip-permissions");
}

async function rejectsUnsupportedLaunchAccessMode(): Promise<void> {
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
}

async function writesActiveSessionPointer(): Promise<void> {
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
  expect(res.json().active_session).toBe(session.id);
  runner.verifyExpectationsConsumed();
  await app.close();
  await cleanup();
}

async function rejectsMissingSession(): Promise<void> {
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
}

async function writesManagedStateToActivePathGlobalBucket(): Promise<void> {
  await withActivePathFixture("fmark-mgd", async (ctx) => {
    const session = await createSession(ctx.active, { slug: "sess-global" });
    const runner = fakeCommandRunner();
    const { app } = makeScopedManagedAgentsApp({
      fallback: ctx.fallback,
      activeRoot: ctx.activeRoot,
      ref: ctx.ref,
      runner,
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
    await expectActivePathAgentState(ctx, res.json().tmux_session, session.id);
    runner.verifyExpectationsConsumed();
    await app.close();
  });
}

async function expectActivePathAgentState(
  ctx: Awaited<Parameters<Parameters<typeof withActivePathFixture>[1]>[0]>,
  tmuxSession: string,
  sessionId: string,
): Promise<void> {
  const primary = ctx.global.projectAgentsDir(ctx.activePath.pathId());
  expect(await readFile(join(primary, "ag-cg", "tmux-session"), "utf8")).toBe(
    tmuxSession,
  );
  expect(await readFile(join(primary, "ag-cg", "runtime"), "utf8")).toBe("claude");
  expect(await readFile(join(primary, "ag-cg", "active-session"), "utf8")).toBe(
    sessionId,
  );
  expect(
    await readFile(join(ctx.active.fmarkDir(), "agents", "ag-cg", "active-session"), "utf8"),
  ).toBe(sessionId);
  await expect(
    readFile(join(ctx.active.fmarkDir(), "agents", "ag-cg", "tmux-session"), "utf8"),
  ).rejects.toThrow();
}

async function spawnsIntoScopedBackgroundRoot(): Promise<void> {
  await withBackgroundPathFixture("fmark-mgd", async (ctx) => {
    const session = await createSession(ctx.background, { slug: "sess-bg" });
    const runner = fakeCommandRunner();
    const bus = fakeBus();
    const { app } = makeScopedManagedAgentsApp({
      fallback: ctx.fallback,
      activeRoot: ctx.activeRoot,
      ref: ctx.ref,
      runner,
      bus,
    });

    expectSpawnCalls(runner);
    const res = await app.inject({
      method: "POST",
      url: "/managed-agents/spawn",
      payload: {
        runtime_id: "claude",
        suggested_participant_id: "ag-bg",
        session_id: session.id,
        path_id: ctx.backgroundPath.pathId(),
      },
    });

    expect(res.statusCode).toBe(200);
    await expectBackgroundSpawnState(ctx, session.id);
    expectNewSessionCwd(runner, ctx.backgroundRoot);
    expect(bus.messages.find((message) => message.type === "managed-agent.spawned"))
      .toMatchObject({
        type: "managed-agent.spawned",
        participant_id: "ag-bg",
        active_session: session.id,
        pathId: ctx.backgroundPath.pathId(),
      });
    runner.verifyExpectationsConsumed();
    await app.close();
  });
}

async function expectBackgroundSpawnState(
  ctx: Awaited<Parameters<Parameters<typeof withBackgroundPathFixture>[1]>[0]>,
  sessionId: string,
): Promise<void> {
  const primary = ctx.global.projectAgentsDir(ctx.backgroundPath.pathId());
  expect(await readFile(join(primary, "ag-bg", "active-session"), "utf8")).toBe(
    sessionId,
  );
  expect(await readFile(join(primary, "ag-bg", "runtime"), "utf8")).toBe("claude");
  await expect(
    readConfig(ctx.background).then((cfg) => cfg.participants["ag-bg"]),
  ).resolves.toBeDefined();
  await expect(
    readConfig(ctx.active).then((cfg) => cfg.participants["ag-bg"]),
  ).resolves.toBeUndefined();
}

async function createServerInitializesTmuxAgainstActivePath(): Promise<void> {
  await withActivePathFixture("fmark-mgd", async ({ fallback, activeRoot, ref }) => {
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
    expectNewSessionCwd(runner, activeRoot);
    runner.verifyExpectationsConsumed();
    await app.close();
  });
}

async function nullActiveSession(): Promise<void> {
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
}

async function rejectsUnknownRuntime(): Promise<void> {
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
}

async function rejectsInvalidSuggestedId(): Promise<void> {
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
}

async function reusesRegisteredParticipant(): Promise<void> {
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
}

async function rollsBackTmuxOnWriteFailure(): Promise<void> {
  const { app, runner, p, cleanup } = await makeApp();
  const sabotagedId = "ag-rb-fail";
  await mkdir(join(p.fmarkDir(), "agents", sabotagedId, "runtime"), {
    recursive: true,
  });

  expectSpawnCalls(runner);
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
  expect(res.statusCode).toBeGreaterThanOrEqual(500);
  runner.verifyExpectationsConsumed();
  await app.close();
  await cleanup();
}

/* Wraps a fake runner so the first `tmux new-session` blocks until released,
   holding the first spawn in flight deterministically while a duplicate
   request races it. */
function gatedRunner(
  inner: FakeRunner,
): FakeRunner & { release(): void; firstNewSession: Promise<void> } {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let markStarted!: () => void;
  const firstNewSession = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  let gatedOnce = false;
  return {
    expect: (prefix, result) => inner.expect(prefix, result),
    verifyExpectationsConsumed: () => inner.verifyExpectationsConsumed(),
    get calls() {
      return inner.calls;
    },
    get inputs() {
      return inner.inputs;
    },
    release,
    firstNewSession,
    async run(argv, opts) {
      if (!gatedOnce && argv[0] === "tmux" && argv[1] === "new-session") {
        gatedOnce = true;
        markStarted();
        await gate;
      }
      return inner.run(argv, opts);
    },
  };
}

async function rejectsConcurrentDuplicateSpawn(): Promise<void> {
  const runner = gatedRunner(fakeCommandRunner());
  const { app, p, cleanup } = await makeApp({ runner });
  expectSpawnCalls(runner);

  const first = app.inject({
    method: "POST",
    url: "/managed-agents/spawn",
    payload: { runtime_id: "codex", suggested_participant_id: "ag-codex-one" },
  });
  // Wait until the first spawn is provably in flight (blocked in new-session).
  await runner.firstNewSession;

  const dup = await app.inject({
    method: "POST",
    url: "/managed-agents/spawn",
    payload: { runtime_id: "codex", suggested_participant_id: "ag-codex-two" },
  });
  expect(dup.statusCode).toBe(409);
  expect(dup.json().error).toMatch(/already spawning/);

  runner.release();
  const res = await first;
  expect(res.statusCode).toBe(200);
  expect(res.json().participant_id).toBe("ag-codex-one");

  // The duplicate never reached tmux and never registered a participant.
  const cfg = await readConfig(p);
  expect(cfg.participants["ag-codex-two"]).toBeUndefined();

  // Once the first settles, the same runtime may spawn again.
  expectSpawnCalls(runner);
  const sequential = await app.inject({
    method: "POST",
    url: "/managed-agents/spawn",
    payload: { runtime_id: "codex", suggested_participant_id: "ag-codex-two" },
  });
  expect(sequential.statusCode).toBe(200);

  runner.verifyExpectationsConsumed();
  await app.close();
  await cleanup();
}
