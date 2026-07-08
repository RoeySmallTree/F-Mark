import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeLaunchDefaults } from "../../../src/mcpInstall/scopePreference.js";
import {
  registerAgent,
  setParticipantOverrides,
} from "../../../src/participants.js";
import { globalPaths, resolveConfigRoot } from "../../../src/paths/global.js";
import { createSession } from "../../../src/sessions.js";
import { createAgentStateStore } from "../../../src/services/agentState.js";
import {
  expectCodexExistingSessionPrompt,
  expectSpawnCalls,
  expectStoppedReconnectRelaunch,
  expectTmuxKilled,
  expectManagedAgentsListSessions,
  fakeBus,
  getNewSessionCall,
  hooksInstalled,
  makeApp,
  postReconnect,
  writeRuntimeRegistry,
} from "./fixtures.js";
import { writeManagedAgentFixture, writeUserProseEvent } from "./agents.js";

export function registerPreflightTests(): void {
  it(
    "backfills Opencode in a legacy registry before launch preflight",
    backfillsOpencodeBeforeLaunchPreflight,
  );
  it(
    "blocks unknown runtimes when the runtime registry would reject spawn",
    blocksUnknownRuntimePreflight,
  );
}

export function registerIntegrationApplyCleanupTests(): void {
  it(
    "kills only managed agents for the affected runtime and preserves others",
    killsOnlyAffectedRuntimeAgents,
  );
}

export function registerReconnectTests(): void {
  it(
    "refreshes the project token before relaunching the existing agent",
    refreshesProjectTokenBeforeRelaunch,
  );
  it(
    "relaunches Codex with the existing session brief and recent events",
    relaunchesCodexWithExistingSessionBrief,
  );
  it(
    "force-relaunches a connected Codex pane instead of no-oping",
    forceRelaunchesConnectedCodexPane,
  );
  it(
    "uses participant overrides on reconnect instead of remembered launch defaults",
    reconnectUsesParticipantOverrideBeforeLaunchDefault,
  );
}

async function backfillsOpencodeBeforeLaunchPreflight(): Promise<void> {
  const { app, p, cleanup } = await makeApp();
  await writeRuntimeRegistry(p, {
    claude: {
      displayName: "Claude Code",
      executable: "claude",
      args: [],
    },
    gemini: {
      displayName: "Gemini",
      executable: "gemini",
      args: [],
    },
  });

  const res = await app.inject({
    method: "POST",
    url: "/managed-agents/preflight",
    payload: { runtime_id: "opencode", participant_id: "ag-opencode-x" },
  });

  expect(res.statusCode).toBe(200);
  const body = res.json();
  expect(body.runtime.runtime_id).toBe("opencode");
  expect(body.runtime.executable).toMatch(/opencode$/);
  expect(body.runtime.reason ?? "").not.toContain("not registered");
  expect(body.mcp.status).not.toBe("blocked");
  expect(body.hooks.status).not.toBe("blocked");
  await app.close();
  await cleanup();
}

async function blocksUnknownRuntimePreflight(): Promise<void> {
  const { app, p, cleanup } = await makeApp();
  await writeRuntimeRegistry(p, {
    claude: {
      displayName: "Claude Code",
      executable: "claude",
      args: [],
    },
  });

  const res = await app.inject({
    method: "POST",
    url: "/managed-agents/preflight",
    payload: { runtime_id: "localbot", participant_id: "ag-localbot-x" },
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
}

async function killsOnlyAffectedRuntimeAgents(): Promise<void> {
  const bus = fakeBus();
  const { app, runner, p, cleanup } = await makeApp({ bus });
  const state = createAgentStateStore({ fallback: p });
  await writeCleanupRuntimeRegistry(p);
  await registerCleanupAgents(p);
  await writeCleanupAgentState(state);
  runner.expect(["tmux", "kill-session", "-t", "tmux-claude"], {
    stdout: "",
    stderr: "",
    exitCode: 0,
  });

  const res = await app.inject({
    method: "POST",
    url: "/managed-agents/integration-apply",
    payload: {
      runtime_id: "claude",
      participant_id: "ag-cleanup-claude",
      scope: "project",
    },
  });

  expect(res.statusCode, res.body).toBe(200);
  await expectCleanupResult(res.json(), state, bus.messages);
  runner.verifyExpectationsConsumed();
  await app.close();
  await cleanup();
}

async function writeCleanupRuntimeRegistry(
  p: Parameters<typeof writeRuntimeRegistry>[0],
): Promise<void> {
  await writeRuntimeRegistry(p, {
    claude: {
      displayName: "Claude Code",
      executable: "/bin/echo",
      args: [],
    },
    codex: {
      displayName: "Codex",
      executable: "/bin/echo",
      args: [],
    },
  });
}

async function registerCleanupAgents(
  p: Parameters<typeof registerAgent>[0],
): Promise<void> {
  const knownRuntimeIds = new Set(["claude", "codex"]);
  await registerAgent(p, {
    name: "Claude",
    suggested_id: "ag-cleanup-claude",
    runtime_id: "claude",
    knownRuntimeIds,
  });
  await registerAgent(p, {
    name: "Codex",
    suggested_id: "ag-cleanup-codex",
    runtime_id: "codex",
    knownRuntimeIds,
  });
}

async function writeCleanupAgentState(
  state: ReturnType<typeof createAgentStateStore>,
): Promise<void> {
  await state.writeTmuxSession("ag-cleanup-claude", "tmux-claude");
  await state.writeRuntime("ag-cleanup-claude", "claude");
  await state.writeTmuxSession("ag-cleanup-codex", "tmux-codex");
  await state.writeRuntime("ag-cleanup-codex", "codex");
}

async function expectCleanupResult(
  body: {
    mcp_changed: boolean;
    cleanup: {
      killed_agents: string[];
      closed_http_sessions: number;
      errors: unknown[];
    };
  },
  state: ReturnType<typeof createAgentStateStore>,
  messages: unknown[],
): Promise<void> {
  expect(body.mcp_changed).toBe(true);
  expect(body.cleanup.killed_agents).toEqual(["ag-cleanup-claude"]);
  expect(body.cleanup.closed_http_sessions).toBe(0);
  expect(body.cleanup.errors).toEqual([]);
  expect(await state.readTmuxSession("ag-cleanup-claude")).toBeNull();
  expect(await state.readRuntime("ag-cleanup-claude")).toBeNull();
  expect(await state.readTmuxSession("ag-cleanup-codex")).toBe("tmux-codex");
  expect(await state.readRuntime("ag-cleanup-codex")).toBe("codex");
  expect(await state.readLog("ag-cleanup-claude")).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ event: "mcp-config-updated" }),
    ]),
  );
  expect(messages).toContainEqual({
    type: "managed-agent.killed",
    participant_id: "ag-cleanup-claude",
  });
}

async function refreshesProjectTokenBeforeRelaunch(): Promise<void> {
  const { app, runner, root, p, cleanup } = await makeApp({
    authToken: "kernel-token",
  });
  const session = await createSession(p, { slug: "reconnect" });
  const participantId = "ag-recon";
  const { defaultTmuxSession: reconnectedSession } =
    await writeManagedAgentFixture({
      p,
      root,
      participantId,
      runtimeId: "claude",
      sessionId: session.id,
      tmuxSession: "fmark-old-dead",
    });

  expectStoppedReconnectRelaunch(runner, reconnectedSession, root);
  await postReconnect(app, participantId, reconnectedSession);
  expect(await readFile(p.tokenFile(), "utf8")).toBe("kernel-token");
  runner.verifyExpectationsConsumed();
  await app.close();
  await cleanup();
}

async function relaunchesCodexWithExistingSessionBrief(): Promise<void> {
  const { app, runner, root, p, cleanup } = await makeApp({
    checkHookInstallStatus: hooksInstalled(),
  });
  const session = await createSession(p, { slug: "codex-reconnect" });
  await writeUserProseEvent(p, session.id, "Resume the Codex reconnect task.");
  const participantId = "ag-codex-recon";
  const { defaultTmuxSession: reconnectedSession } =
    await writeManagedAgentFixture({
      p,
      root,
      participantId,
      runtimeId: "codex",
      sessionId: session.id,
      tmuxSession: "fmark-old-codex-dead",
    });

  expectStoppedReconnectRelaunch(runner, reconnectedSession, root);
  await postReconnect(app, participantId, reconnectedSession);
  await expectCodexExistingSessionPrompt(runner, {
    content: "Resume the Codex reconnect task.",
    root,
    sessionId: session.id,
    participantId,
  });
  runner.verifyExpectationsConsumed();
  await app.close();
  await cleanup();
}

async function forceRelaunchesConnectedCodexPane(): Promise<void> {
  const { app, runner, root, p, cleanup } = await makeApp({
    checkHookInstallStatus: hooksInstalled(),
  });
  const session = await createSession(p, { slug: "codex-reconnect-live" });
  const participantId = "ag-codex-live";
  const { tmuxSession: managedSession } = await writeManagedAgentFixture({
    p,
    root,
    participantId,
    runtimeId: "codex",
    sessionId: session.id,
  });

  expectManagedAgentsListSessions(runner, root, managedSession);
  runner.expect(["tmux", "kill-session"], {
    stdout: "",
    stderr: "",
    exitCode: 0,
  });
  expectSpawnCalls(runner);
  expectManagedAgentsListSessions(runner, root, managedSession);
  expectManagedAgentsListSessions(runner, root, managedSession);

  await postReconnect(app, participantId, managedSession);
  expectTmuxKilled(runner);
  expect(String(getNewSessionCall(runner).at(-1))).toContain(session.id);
  runner.verifyExpectationsConsumed();
  await app.close();
  await cleanup();
}

async function reconnectUsesParticipantOverrideBeforeLaunchDefault(): Promise<void> {
  const { app, runner, root, p, cleanup } = await makeApp();
  const session = await createSession(p, { slug: "claude-reconnect-model" });
  const participantId = "ag-cl-model";
  const { defaultTmuxSession: reconnectedSession } =
    await writeManagedAgentFixture({
      p,
      root,
      participantId,
      runtimeId: "claude",
      sessionId: session.id,
      tmuxSession: "fmark-old-claude-model-dead",
    });
  await setParticipantOverrides(p, participantId, {
    model: "sonnet",
    effort: "low",
  });
  await writeLaunchDefaults(
    "claude",
    {
      model: "fable",
      effort: "max",
    },
    testGlobalPaths(root),
  );

  expectStoppedReconnectRelaunch(runner, reconnectedSession, root);
  await postReconnect(app, participantId, reconnectedSession);
  const spawnCall = getNewSessionCall(runner);
  expectArgPair(spawnCall, "--model", "sonnet");
  expectArgPair(spawnCall, "--effort", "low");
  expect(spawnCall).not.toContain("fable");
  expect(spawnCall).not.toContain("max");
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
