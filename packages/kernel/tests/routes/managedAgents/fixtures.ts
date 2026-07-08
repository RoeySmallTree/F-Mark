import { expect } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerManagedAgentsRoutes } from "../../../src/routes/managedAgents.js";
import { initProject } from "../../../src/project.js";
import { paths } from "../../../src/paths.js";
import { createPresenceTracker } from "../../../src/presence/tracker.js";
import { fakeCommandRunner } from "../../../src/tmux/commandRunner.js";
import { createTmuxManager } from "../../../src/tmux/manager.js";
import { createInputQueue } from "../../../src/tmux/inputQueue.js";
import type { Bus, BusMessage } from "../../../src/ws/bus.js";
import type { DetectResult } from "../../../src/hooksInstall/types.js";
import { FMARK_LAUNCH_PROMPT_MARKER } from "../../../src/launchPrompt.js";

export type FakeRunner = ReturnType<typeof fakeCommandRunner>;
export type ProjectPaths = ReturnType<typeof paths>;

export function fakeBus(): Bus & { messages: BusMessage[] } {
  const messages: BusMessage[] = [];
  return {
    messages,
    publish(msg: BusMessage) {
      messages.push(msg);
    },
  };
}

export async function makeApp(opts?: {
  bus?: Bus;
  authToken?: string | null;
  /** Runner override (e.g. a gated wrapper); defaults to a fresh fake. */
  runner?: FakeRunner;
  checkHookInstallStatus?: (o: {
    runtimeId: string;
    participantId: string;
    userParticipantId?: string;
    projectRoot?: string;
  }) => Promise<DetectResult>;
}) {
  const root = await mkdtemp(join(tmpdir(), "fmark-mgd-r-"));
  const home = join(root, "home");
  const codexHome = join(home, ".codex");
  await mkdir(codexHome, { recursive: true });
  const p = paths(root);
  await initProject(p);
  const runner = opts?.runner ?? fakeCommandRunner();
  const mgr = createTmuxManager({
    runner,
    projectRoot: root,
    promptDelays: { settleMs: 0, confirmMs: 0 },
  });
  const tracker = createPresenceTracker({ broadcast: () => {} });
  const bus: Bus = opts?.bus ?? { publish: () => {} };
  const app = Fastify();
  registerManagedAgentsRoutes(app, {
    paths: p,
    tmux: mgr,
    tracker,
    projectRoot: root,
    inputQueue: createInputQueue(),
    bus,
    checkHookInstallStatus: opts?.checkHookInstallStatus,
    authToken: opts?.authToken,
    env: {
      ...process.env,
      HOME: home,
      CODEX_HOME: codexHome,
    },
  });
  return { app, runner, root, p, tracker, cleanup: () => rm(root, { recursive: true, force: true }) };
}

export function expectSpawnCalls(runner: FakeRunner) {
  expectTmuxOk(runner, ["tmux", "new-session"]);
  expectTmuxOk(runner, ["tmux", "set-option"]);
  expectTmuxOk(runner, ["tmux", "set-option"]);
}

export function expectTmuxSessionLive(
  runner: FakeRunner,
  tmuxSession: string,
  _root: string,
) {
  runner.expect(["tmux", "display-message"], {
    stdout: "0\n",
    stderr: "",
    exitCode: 0,
  });
}

export function expectTmuxSessionsGone(runner: FakeRunner) {
  runner.expect(["tmux", "ls"], {
    stdout: "",
    stderr: "",
    exitCode: 0,
  });
}

export function expectTerminalSpawnCalls(runner: FakeRunner) {
  expectTmuxSessionsGone(runner);
  expectTmuxOk(runner, ["tmux", "new-session"]);
  expectTmuxOk(runner, ["tmux", "set-option"]);
}

function expectTmuxOk(runner: FakeRunner, prefix: string[]) {
  runner.expect(prefix, { stdout: "", stderr: "", exitCode: 0 });
}

function expectNoTmuxNewSession(runner: FakeRunner) {
  expect(
    runner.calls.some((call) => call[0] === "tmux" && call[1] === "new-session"),
  ).toBe(false);
}

export function getNewSessionCall(runner: FakeRunner): string[] {
  const newSessionCall = runner.calls.find(
    (call) => call[0] === "tmux" && call[1] === "new-session",
  );
  expect(newSessionCall).toBeDefined();
  return newSessionCall!;
}

export function expectNewSessionCwd(runner: FakeRunner, cwd: string) {
  const newSessionCall = getNewSessionCall(runner);
  const cwdIndex = newSessionCall.indexOf("-c");
  expect(newSessionCall[cwdIndex + 1]).toBe(cwd);
}

export function expectNoTmuxSendKeys(runner: FakeRunner) {
  expect(
    runner.calls.some((call) => call[0] === "tmux" && call[1] === "send-keys"),
  ).toBe(false);
}

export function expectTmuxKilled(runner: FakeRunner) {
  expect(
    runner.calls.some((call) => call[0] === "tmux" && call[1] === "kill-session"),
  ).toBe(true);
}

export function expectManagedAgentUpdated(
  bus: Bus & { messages: BusMessage[] },
  participantId: string,
  activityState = "running",
) {
  expect(
    bus.messages.some(
      (msg) =>
        msg.type === "managed-agent.updated" &&
        msg.agent.participant_id === participantId &&
        msg.agent.activity_state === activityState,
    ),
  ).toBe(true);
}

/* The launch argv carries only a short marked pointer; the full packet
   (onboarding + existing-session brief) lives in the agent's
   launch-packet.md, so content assertions read that file. */
export async function expectCodexExistingSessionPrompt(
  runner: FakeRunner,
  {
    content,
    root,
    participantId,
    sessionId,
    shouldTellAgentToContinue = false,
  }: {
    content: string;
    root: string;
    participantId: string;
    sessionId?: string;
    shouldTellAgentToContinue?: boolean;
  },
) {
  const newSessionCall = getNewSessionCall(runner);
  expect(newSessionCall).toContain("codex");
  const prompt = String(newSessionCall.at(-1));
  expect(prompt).toContain(FMARK_LAUNCH_PROMPT_MARKER);
  expect(prompt).toContain("# F-Mark launch");
  const packetPath = join(
    root,
    ".f-mark",
    "agents",
    participantId,
    "launch-packet.md",
  );
  expect(prompt).toContain(packetPath);
  expect(prompt).toContain(participantId);
  const packet = await readFile(packetPath, "utf8");
  expect(packet).toContain("Existing Session Brief");
  expect(packet).toContain(content);
  if (sessionId !== undefined) {
    expect(prompt).toContain(sessionId);
    expect(packet).toContain(sessionId);
  }
  if (shouldTellAgentToContinue) {
    expect(packet).toContain("answer or continue that request");
  }
  expect(packet).not.toContain("Immediately call `fmark_post_prose`");
}

export function expectStoppedReconnectRelaunch(
  runner: FakeRunner,
  tmuxSession: string,
  root: string,
) {
  expectTmuxSessionsGone(runner);
  expectSpawnCalls(runner);
  expectManagedAgentsListSessions(runner, root, tmuxSession);
  expectManagedAgentsListSessions(runner, root, tmuxSession);
}

export async function postReconnect(
  app: FastifyInstance,
  participantId: string,
  expectedTmuxSession: string,
) {
  const res = await app.inject({
    method: "POST",
    url: `/managed-agents/${participantId}/reconnect`,
  });
  expect(res.statusCode).toBe(200);
  expect(res.json().agent.tmux_session).toBe(expectedTmuxSession);
  return res;
}

export async function getManagedAgents(app: FastifyInstance) {
  const list = await app.inject({ method: "GET", url: "/managed-agents" });
  expect(list.statusCode).toBe(200);
  return list.json();
}

export function expectManagedAgentsListSessions(
  runner: FakeRunner,
  _root: string,
  ...tmuxSessions: string[]
) {
  runner.expect(["tmux", "ls"], {
    stdout:
      tmuxSessions.length === 0
        ? ""
        : `${tmuxSessions.map((session) => `${session}|1710000000`).join("\n")}\n`,
    stderr: "",
    exitCode: 0,
  });
}

export async function ensureManagedAgents(
  app: FastifyInstance,
  sessionId: string,
  root: string,
) {
  const res = await app.inject({
    method: "POST",
    url: `/sessions/${sessionId}/ensure-managed-agents`,
    payload: { root, idle_only: true },
  });
  expect(res.statusCode).toBe(200);
  return res.json();
}

export async function expectEnsureManagedAgentsSkipped(
  app: FastifyInstance,
  runner: FakeRunner,
  sessionId: string,
  root: string,
  skipped: unknown,
) {
  expectTmuxSessionsGone(runner);
  const body = await ensureManagedAgents(app, sessionId, root);
  expect(body.resumed).toEqual([]);
  expect(body.skipped).toEqual([skipped]);
  expectNoTmuxNewSession(runner);
}

export async function deleteManagedAgentWithToken(
  app: FastifyInstance,
  runner: FakeRunner,
  participantId: string,
) {
  const tok = await app.inject({
    method: "GET",
    url: `/managed-agents/${participantId}/confirm-token`,
  });
  const token = tok.json().token as string;
  runner.expect(["tmux", "kill-session"], { stdout: "", stderr: "", exitCode: 0 });
  const res = await app.inject({
    method: "DELETE",
    url: `/managed-agents/${participantId}?confirm=${token}`,
  });
  expect(res.statusCode).toBe(200);
  return { res, token };
}

export async function setZeroDelayClaude(p: ProjectPaths): Promise<void> {
  await writeFile(
    join(p.fmarkDir(), "runtimes.json"),
    JSON.stringify(
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
    ),
    "utf8",
  );
}

export async function writeRuntimeRegistry(
  p: ProjectPaths,
  runtimes: Record<string, unknown>,
): Promise<void> {
  await writeFile(
    join(p.fmarkDir(), "runtimes.json"),
    JSON.stringify({ version: "1.0", runtimes }, null, 2),
    "utf8",
  );
}

export function hooksInstalled(configPath = "~/.codex/hooks.json") {
  return async (): Promise<DetectResult> => ({
    installed: true,
    configPath,
    detectedEntries: [],
    expectedEntries: [],
  });
}
