import { expect } from "vitest";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import {
  createServer,
  type ServerDeps,
} from "../../../src/server.js";
import { initProject } from "../../../src/project.js";
import {
  listParticipants,
  registerAgent,
  setParticipantOverrides,
} from "../../../src/participants.js";
import { createSession } from "../../../src/sessions.js";
import { writeEventFile } from "../../../src/events/writer.js";
import { serializeProse } from "../../../src/events/prose.js";
import { paths } from "../../../src/paths.js";
import { activePaths } from "../../../src/paths/active.js";
import { globalPaths } from "../../../src/paths/global.js";
import { PathContextRef } from "../../../src/paths/contextRef.js";
import { registerProjectPath } from "../../../src/paths/registry.js";
import {
  createAgentStateStore,
  type AgentStateStore,
} from "../../../src/services/agentState.js";
import {
  fakeCommandRunner,
  type FakeCommandRunner,
} from "../../../src/tmux/commandRunner.js";
import { fmarkAgentSessionName } from "../../../src/tmux/naming.js";
import { withTempProject } from "../../helpers/tempdir.js";

type SessionPaths = ReturnType<typeof paths>;

interface SessionAppFixture {
  app: FastifyInstance;
  p: SessionPaths;
  root: string;
}

type SessionServerDeps = Partial<Omit<ServerDeps, "paths" | "token">> & {
  token?: string | null;
};

async function withInitializedSessionApp<T>(
  root: string,
  fn: (fixture: SessionAppFixture) => Promise<T>,
  serverDeps: SessionServerDeps = {},
): Promise<T> {
  const p = paths(root);
  await initProject(p);
  const { token = null, ...rest } = serverDeps;
  const { app } = createServer({ ...rest, token, paths: p });
  try {
    return await fn({ app, p, root });
  } finally {
    await app.close();
  }
}

export async function withTempSessionApp<T>(
  fn: (fixture: SessionAppFixture) => Promise<T>,
  serverDeps: SessionServerDeps = {},
): Promise<T> {
  return withTempProject((root) =>
    withInitializedSessionApp(root, fn, serverDeps),
  );
}

export async function withTempRoots<const Prefixes extends readonly string[], T>(
  prefixes: Prefixes,
  fn: (roots: { readonly [Index in keyof Prefixes]: string }) => Promise<T>,
): Promise<T> {
  const roots = prefixes.map((prefix) => mkdtempSync(join(tmpdir(), prefix)));
  try {
    return await fn(roots as { readonly [Index in keyof Prefixes]: string });
  } finally {
    for (const root of roots) {
      rmSync(root, { recursive: true, force: true });
    }
  }
}

export function createPathContext(root: string, configRoot: string) {
  const g = globalPaths(configRoot);
  const ref = new PathContextRef({
    global: g,
    active: activePaths(root),
  });
  return { g, ref };
}

export async function withPathContextSessionApp<T>(
  root: string,
  configRoot: string,
  fn: (
    fixture: SessionAppFixture & ReturnType<typeof createPathContext>,
  ) => Promise<T>,
  serverDeps: SessionServerDeps = {},
): Promise<T> {
  const context = createPathContext(root, configRoot);
  return withInitializedSessionApp(
    root,
    (fixture) => fn({ ...fixture, ...context }),
    { ...serverDeps, pathContextRef: context.ref },
  );
}

export async function withTempPathContextSessionApp<T>(
  fn: (
    fixture: SessionAppFixture & ReturnType<typeof createPathContext>,
  ) => Promise<T>,
  serverDeps: SessionServerDeps = {},
): Promise<T> {
  return withTempProject((root) =>
    withTempRoots(["fmark-cfg-"], async ([configRoot]) =>
      withPathContextSessionApp(root, configRoot, fn, serverDeps),
    ),
  );
}

async function createFallbackAndOtherRouteSessions(
  app: FastifyInstance,
  otherRoot: string,
): Promise<void> {
  await app.inject({
    method: "POST",
    url: "/sessions",
    payload: { slug: "fallback-session" },
  });
  await app.inject({
    method: "POST",
    url: "/sessions",
    payload: { slug: "other-session", path: otherRoot },
  });
}

export async function withFallbackAndOtherRouteSessionApp<T>(
  fallbackRoot: string,
  fn: (
    fixture: SessionAppFixture &
      ReturnType<typeof createPathContext> & {
        otherRoot: string;
      },
  ) => Promise<T>,
): Promise<T> {
  return withTempRoots(
    ["fmark-other-", "fmark-cfg-"],
    async ([otherRoot, configRoot]) =>
      withPathContextSessionApp(fallbackRoot, configRoot, async (fixture) => {
        await createFallbackAndOtherRouteSessions(fixture.app, otherRoot);
        return fn({ ...fixture, otherRoot });
      }),
  );
}

interface SessionListEntry {
  id: string;
  path: string;
  path_id?: string;
}

export async function getAllSessions(
  app: FastifyInstance,
): Promise<SessionListEntry[]> {
  const res = await app.inject({
    method: "GET",
    url: "/sessions?scope=all",
  });
  expect(res.statusCode).toBe(200);
  return res.json().sessions as SessionListEntry[];
}

export async function withRegisteredPathSessionApp<T>(
  fallbackRoot: string,
  configRoot: string,
  otherRoot: string,
  fn: (
    fixture: SessionAppFixture &
      ReturnType<typeof createPathContext> & {
        otherPaths: SessionPaths;
      },
  ) => Promise<T>,
): Promise<T> {
  const p = paths(fallbackRoot);
  await initProject(p);
  const otherPaths = paths(otherRoot);
  await initProject(otherPaths);
  const context = createPathContext(fallbackRoot, configRoot);
  await registerProjectPath(context.g, otherRoot);
  const { app } = createServer({
    token: null,
    paths: p,
    pathContextRef: context.ref,
  });
  try {
    return await fn({
      app,
      p,
      root: fallbackRoot,
      ...context,
      otherPaths,
    });
  } finally {
    await app.close();
  }
}

async function firstParticipantId(p: SessionPaths): Promise<string> {
  const [participant] = Object.keys(await listParticipants(p));
  return participant!;
}

export async function writeProseEvent(
  p: SessionPaths,
  sessionId: string,
  content: string,
  options: { participantId?: string; timestamp?: string } = {},
) {
  return writeEventFile(p, sessionId, {
    participant_id: options.participantId ?? (await firstParticipantId(p)),
    kind: "prose",
    ext: "md",
    timestamp: options.timestamp,
    contents: serializeProse({ content }),
  });
}

export async function createSessionWithProse(
  p: SessionPaths,
  slug: string,
  events: Array<{ content: string; timestamp?: string }>,
) {
  const session = await createSession(p, { slug });
  const participantId = await firstParticipantId(p);
  for (const event of events) {
    await writeProseEvent(p, session.id, event.content, {
      participantId,
      timestamp: event.timestamp,
    });
  }
  return { participantId, session };
}

export function proseContentsFromGroups(body: {
  groups: Array<{ events: Array<{ payload: { content: string } }> }>;
}): string[] {
  return body.groups.flatMap((group) =>
    group.events.map((event) => event.payload.content),
  );
}

export async function makeForkable(root: string): Promise<{
  p: SessionPaths;
  sourceId: string;
}> {
  const p = paths(root);
  await initProject(p);
  const source = await createSession(p, { slug: "src" });
  await writeProseEvent(p, source.id, "hello", {
    participantId: Object.keys(await listParticipants(p)).find((id) =>
      id.startsWith("us-"),
    )!,
  });
  return { p, sourceId: source.id };
}

export async function withForkableApp<T>(
  root: string,
  fn: (fixture: SessionAppFixture & { sourceId: string }) => Promise<T>,
  serverDeps: SessionServerDeps = {},
): Promise<T> {
  const { p, sourceId } = await makeForkable(root);
  const { token = null, ...rest } = serverDeps;
  const { app } = createServer({ ...rest, token, paths: p });
  try {
    return await fn({ app, p, root, sourceId });
  } finally {
    await app.close();
  }
}

function listEventFiles(sessionDir: string): string[] {
  return readdirSync(sessionDir).filter(
    (name) => !name.startsWith(".") && !name.includes(".tmp"),
  );
}

function forkLinkFiles(p: SessionPaths, sessionId: string): string[] {
  return listEventFiles(p.sessionDir(sessionId)).filter((file) =>
    file.endsWith("fork-link.json"),
  );
}

interface JsonEvent<T = unknown> {
  kind: string;
  payload: T;
  participant_id: string;
}

function readJsonEvent<T = unknown>(
  sessionDir: string,
  filename: string,
): JsonEvent<T> {
  const raw = readFileSync(join(sessionDir, filename), "utf8");
  const payload = JSON.parse(raw) as T;
  const match =
    /^(\d{8}T\d{6}(?:\.\d{3})?Z)_((?:us|ag|sys|grp)-[a-z0-9-]{2,12})\.([a-z-]+)\.json$/.exec(
      filename,
    );
  return {
    kind: match?.[3] ?? "?",
    payload,
    participant_id: match?.[2] ?? "?",
  };
}

export function expectForkLinkCount(
  p: SessionPaths,
  sessionId: string,
  count: number,
): string[] {
  const links = forkLinkFiles(p, sessionId);
  expect(links.length).toBe(count);
  return links;
}

interface ForkLinkPayload {
  direction: string;
  other_session_id: string;
  other_session_slug?: string;
}

export function expectOnlyForkLink(
  p: SessionPaths,
  sessionId: string,
  expected: ForkLinkPayload,
): JsonEvent<ForkLinkPayload> {
  const [filename] = expectForkLinkCount(p, sessionId, 1);
  const event = readJsonEvent<ForkLinkPayload>(p.sessionDir(sessionId), filename!);
  expect(event.kind).toBe("fork-link");
  expect(event.participant_id).toBe("sys-fork");
  expect(event.payload.direction).toBe(expected.direction);
  expect(event.payload.other_session_id).toBe(expected.other_session_id);
  if (expected.other_session_slug !== undefined) {
    expect(event.payload.other_session_slug).toBe(expected.other_session_slug);
  }
  return event;
}

export async function forkSession(
  app: FastifyInstance,
  sourceId: string,
  name: string,
) {
  return app.inject({
    method: "POST",
    url: `/sessions/${sourceId}/fork`,
    payload: { name },
  });
}

export function expectSessionDirExists(
  root: string,
  sessionId: string,
  expected: boolean,
): void {
  expect(existsSync(join(root, ".f-mark", "sessions", sessionId))).toBe(
    expected,
  );
}

const CLAUDE_AGENT_ID = "ag-claude";
const CLAUDE_RUNTIME_ID = "claude";
const CLAUDE_MODEL = "claude-sonnet-4-5-20250929";
const CLAUDE_EFFORT = "high";
const CLAUDE_NATIVE_SOURCE_SESSION_ID = "claude-native-source";

export interface ForkAgentResult {
  participant_id: string;
  fork_participant_id: string;
  status: string;
  tmux_session: string;
  native_command: string;
  native_parent_session_id: string;
}

interface ClaudeSourceAgentFixture {
  agentState: AgentStateStore;
  sourceTmuxSession: string;
}

export async function withForkableClaudeAgentApp<T>(
  root: string,
  p: SessionPaths,
  sourceId: string,
  fn: (
    fixture: SessionAppFixture &
      ClaudeSourceAgentFixture & {
        runner: FakeCommandRunner;
      },
  ) => Promise<T>,
): Promise<T> {
  const agentFixture = await createClaudeSourceAgentFixture(root, p, sourceId);
  const runner = fakeCommandRunner();
  expectInitialForkAgentTmuxCommands(runner);
  const { app } = createServer({
    token: null,
    paths: p,
    commandRunner: runner,
    allowProcessApiNoAuth: true,
  });
  try {
    return await fn({
      app,
      p,
      root,
      runner,
      ...agentFixture,
    });
  } finally {
    await app.close();
  }
}

async function createClaudeSourceAgentFixture(
  root: string,
  p: SessionPaths,
  sourceId: string,
): Promise<ClaudeSourceAgentFixture> {
  await registerAgent(p, {
    name: "Claude",
    suggested_id: CLAUDE_AGENT_ID,
    runtime_id: CLAUDE_RUNTIME_ID,
    knownRuntimeIds: new Set(["claude", "codex", "opencode"]),
  });
  await setParticipantOverrides(p, CLAUDE_AGENT_ID, {
    model: CLAUDE_MODEL,
    effort: CLAUDE_EFFORT,
  });
  const agentState = createAgentStateStore({ fallback: p });
  const sourceTmuxSession = fmarkAgentSessionName(root, CLAUDE_AGENT_ID);
  await agentState.writeActiveSession(CLAUDE_AGENT_ID, sourceId);
  await agentState.writeRuntime(CLAUDE_AGENT_ID, CLAUDE_RUNTIME_ID);
  await agentState.writeTmuxSession(CLAUDE_AGENT_ID, sourceTmuxSession);
  await agentState.writeRuntimeSession(CLAUDE_AGENT_ID, {
    desired_name: sourceId,
    native_name_applied: true,
    native_session_id: CLAUDE_NATIVE_SOURCE_SESSION_ID,
    native_id_source: "hook",
  });
  return { agentState, sourceTmuxSession };
}

function expectInitialForkAgentTmuxCommands(runner: FakeCommandRunner): void {
  runner.expect(["tmux", "new-session"], {
    stdout: "",
    stderr: "",
    exitCode: 0,
  });
  runner.expect(["tmux", "set-option"], {
    stdout: "",
    stderr: "",
    exitCode: 0,
  });
  runner.expect(["tmux", "set-option"], {
    stdout: "",
    stderr: "",
    exitCode: 0,
  });
}

export function expectRelaunchedForkAgent(
  body: {
    agents: ForkAgentResult[];
    warnings: unknown[];
  },
  root: string,
  forkId: string,
): ForkAgentResult {
  const agentResult = body.agents[0]!;
  expect(agentResult).toEqual(
    expect.objectContaining({
      participant_id: CLAUDE_AGENT_ID,
      status: "relaunched",
      native_parent_session_id: CLAUDE_NATIVE_SOURCE_SESSION_ID,
    }),
  );
  expect(agentResult.fork_participant_id).toMatch(/^ag-f[a-f0-9]{10}$/);
  expect(agentResult.tmux_session).toBe(
    fmarkAgentSessionName(root, agentResult.fork_participant_id),
  );
  expect(agentResult.native_command).toContain(
    "claude --resume claude-native-source --fork-session --name ",
  );
  expect(body.warnings).toEqual([]);
  return agentResult;
}

export function expectForkAgentSpawnCall(
  runner: FakeCommandRunner,
  root: string,
  forkId: string,
  agentResult: ForkAgentResult,
): void {
  const spawnCall = runner.calls.find(
    (call) => call[0] === "tmux" && call[1] === "new-session",
  );
  expect(spawnCall).toEqual(
    expect.arrayContaining([
      "-e",
      "F_MARK_RUNTIME_ID=claude",
      "-e",
      `F_MARK_PATH=${root}`,
      "-e",
      `F_MARK_SESSION_ID=${forkId}`,
      "-e",
      `F_MARK_AGENT_ID=${agentResult.fork_participant_id}`,
      "--",
      "claude",
      "--resume",
      CLAUDE_NATIVE_SOURCE_SESSION_ID,
      "--fork-session",
      "--name",
      forkId,
    ]),
  );
}

export async function expectForkAgentParticipantState(input: {
  p: SessionPaths;
  agentState: AgentStateStore;
  sourceId: string;
  sourceTmuxSession: string;
  forkId: string;
  agentResult: ForkAgentResult;
}): Promise<void> {
  const {
    p,
    agentState,
    sourceId,
    sourceTmuxSession,
    forkId,
    agentResult,
  } = input;
  const participants = await listParticipants(p, { agentState });
  expect(participants[CLAUDE_AGENT_ID]?.active_session).toBe(sourceId);
  expect(await agentState.readActiveSession(CLAUDE_AGENT_ID)).toBe(sourceId);
  expect(await agentState.readTmuxSession(CLAUDE_AGENT_ID)).toBe(
    sourceTmuxSession,
  );
  const forkParticipant = participants[agentResult.fork_participant_id]!;
  expect(forkParticipant).toEqual(
    expect.objectContaining({
      kind: "agent",
      name: "Claude",
      runtime_id: CLAUDE_RUNTIME_ID,
      model_override: CLAUDE_MODEL,
      effort_override: CLAUDE_EFFORT,
      active_session: forkId,
    }),
  );
  expect(await agentState.readActiveSession(agentResult.fork_participant_id)).toBe(
    forkId,
  );
  expect(await agentState.readRuntime(agentResult.fork_participant_id)).toBe(
    CLAUDE_RUNTIME_ID,
  );
  expect(await agentState.readTmuxSession(agentResult.fork_participant_id)).toBe(
    agentResult.tmux_session,
  );
  expect(await agentState.readRuntimeSession(agentResult.fork_participant_id)).toEqual(
    {
      desired_name: forkId,
      native_name_applied: true,
      native_parent_session_id: CLAUDE_NATIVE_SOURCE_SESSION_ID,
    },
  );
}

export async function expectManagedForkAgentStatus(input: {
  app: FastifyInstance;
  runner: FakeCommandRunner;
  root: string;
  sourceTmuxSession: string;
  forkId: string;
  agentResult: ForkAgentResult;
}): Promise<void> {
  const { app, runner, root, sourceTmuxSession, forkId, agentResult } = input;
  runner.expect(["tmux", "ls"], {
    stdout: `${sourceTmuxSession}\n${agentResult.tmux_session}\n`,
    stderr: "",
    exitCode: 0,
  });
  const status = await app.inject({
    method: "GET",
    url: `/managed-agents/status?session_id=${encodeURIComponent(forkId)}`,
  });
  expect(status.statusCode).toBe(200);
  const forkStatus = status
    .json()
    .agents.find(
      (agent: { participant_id: string }) =>
        agent.participant_id === agentResult.fork_participant_id,
    );
  expect(forkStatus).toEqual(
    expect.objectContaining({
      active_session: forkId,
      runtime_id: CLAUDE_RUNTIME_ID,
      managed: true,
      tmux_session: agentResult.tmux_session,
      connection_state: "connected",
      runtime_state: expect.objectContaining({
        model: CLAUDE_MODEL,
        effort: CLAUDE_EFFORT,
        source: "override",
        configuredModel: CLAUDE_MODEL,
        configuredEffort: CLAUDE_EFFORT,
      }),
    }),
  );
}
