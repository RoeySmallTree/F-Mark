import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import type { DetectResult } from "../../../src/hooksInstall/types.js";
import { FMARK_LAUNCH_PROMPT_MARKER } from "../../../src/launchPrompt.js";
import { createSession } from "../../../src/sessions.js";
import { readEvents } from "../../../src/events/reader.js";
import {
  expectCodexExistingSessionPrompt,
  expectManagedAgentsListSessions,
  expectNoTmuxSendKeys,
  expectSpawnCalls,
  fakeBus,
  getNewSessionCall,
  hooksInstalled,
  makeApp,
  setZeroDelayClaude,
} from "./fixtures.js";
import { userParticipantId, writeUserProseEvent } from "./agents.js";

export function registerHookStatusLaunchPromptTests(): void {
  it(
    "returns hooks_status='installed' and passes Claude the launch prompt as native argv",
    returnsInstalledHooksStatusAndClaudeLaunchPrompt,
  );
  it(
    "passes Codex an existing-session brief before generic onboarding",
    passesCodexExistingSessionBrief,
  );
  it(
    "returns hooks_status='missing' and does not send a fallback kickoff",
    returnsMissingHooksStatusWithoutFallbackKickoff,
  );
  it(
    "returns hooks_status='not_required' and seeds stale presence when the runtime has no hook entries",
    returnsNotRequiredHooksStatusAndStalePresence,
  );
  it(
    "projects a terminal approval prompt into the chat and responds with the selected provider option",
    projectsTerminalApprovalPromptAndResponds,
  );
}

async function returnsInstalledHooksStatusAndClaudeLaunchPrompt(): Promise<void> {
  const { app, runner, p, tracker, cleanup } = await makeApp({
    checkHookInstallStatus: hooksInstalled("~/.claude/settings.json"),
  });
  await setZeroDelayClaude(p);
  const session = await createSession(p, { slug: "sess-x" });
  await writeUserProseEvent(p, session.id, "Please continue the active task.");
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
  await expectClaudeLaunchPrompt(runner, p.root(), session.id);
  expectNoTmuxSendKeys(runner);
  expect(tracker.snapshot().get("ag-hk-ok")?.state).toBe("launching");
  runner.verifyExpectationsConsumed();
  await app.close();
  await cleanup();
}

async function expectClaudeLaunchPrompt(
  runner: Parameters<typeof getNewSessionCall>[0],
  root: string,
  sessionId: string,
): Promise<void> {
  const prompt = String(getNewSessionCall(runner).at(-1));
  expect(getNewSessionCall(runner)).toContain("claude");
  expect(prompt).toContain(FMARK_LAUNCH_PROMPT_MARKER);
  expect(prompt).toContain("# F-Mark launch");
  const packetPath = join(root, ".f-mark", "agents", "ag-hk-ok", "launch-packet.md");
  expect(prompt).toContain(packetPath);
  expect(prompt).toContain(sessionId);
  expect(prompt).toContain("ag-hk-ok");
  // The full packet lives in the file the pointer references.
  const packet = await readFile(packetPath, "utf8");
  expect(packet).toContain("F-Mark agent onboarding");
  expect(packet).toContain("Existing Session Brief");
  expect(packet).toContain("joining an existing F-Mark session");
  expect(packet).toContain("Please continue the active task.");
  expect(packet).toContain('"hooks_status": "installed"');
}

async function passesCodexExistingSessionBrief(): Promise<void> {
  const { app, runner, p, cleanup } = await makeApp({
    checkHookInstallStatus: hooksInstalled(),
  });
  const session = await createSession(p, { slug: "codex-existing" });
  await writeUserProseEvent(
    p,
    session.id,
    "Please continue the active Codex task.",
  );
  expectSpawnCalls(runner);

  const res = await app.inject({
    method: "POST",
    url: "/managed-agents/spawn",
    payload: {
      runtime_id: "codex",
      suggested_participant_id: "ag-codex-hist",
      session_id: session.id,
    },
  });

  expect(res.statusCode).toBe(200);
  await expectCodexExistingSessionPrompt(runner, {
    content: "Please continue the active Codex task.",
    root: p.root(),
    participantId: "ag-codex-hist",
    shouldTellAgentToContinue: true,
  });
  expectNoTmuxSendKeys(runner);
  runner.verifyExpectationsConsumed();
  await app.close();
  await cleanup();
}

async function returnsMissingHooksStatusWithoutFallbackKickoff(): Promise<void> {
  const { app, runner, p, cleanup } = await makeApp({
    checkHookInstallStatus: missingHookCheck,
  });
  await setZeroDelayClaude(p);
  expectSpawnCalls(runner);

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
}

async function missingHookCheck(): Promise<DetectResult> {
  return {
    installed: false,
    configPath: "~/.claude/settings.json",
    detectedEntries: [],
    expectedEntries: [
      {
        event: "Stop",
        command: "f-mark hook auto-stream ag-hk-no",
      },
    ],
  };
}

async function returnsNotRequiredHooksStatusAndStalePresence(): Promise<void> {
  const { app, runner, p, tracker, cleanup } = await makeApp({
    checkHookInstallStatus: noHooksRequiredCheck,
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
}

async function noHooksRequiredCheck(): Promise<DetectResult> {
  return {
    installed: false,
    configPath: "(manual-stream mode — no hooks needed in v0.4)",
    detectedEntries: [],
    expectedEntries: [],
  };
}

async function projectsTerminalApprovalPromptAndResponds(): Promise<void> {
  const bus = fakeBus();
  const { app, runner, p, cleanup } = await makeApp({
    bus,
    checkHookInstallStatus: terminalApprovalHookCheck,
  });
  await setZeroDelayClaude(p);
  const session = await createSession(p, { slug: "terminal-approval" });
  expectSpawnCalls(runner);
  const tmuxSession = await spawnTerminalApprovalAgent(app, session.id);
  const userId = await userParticipantId(p);

  expectTerminalPromptCapture(runner, tmuxSession, p.root());
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const request = await expectTerminalAccessRequest(p, session.id, bus);

  expectTerminalResponseTmuxSend(runner, tmuxSession, p.root());
  const response = await app.inject({
    method: "POST",
    url: `/managed-agents/ag-terminal/access-requests/${encodeURIComponent(
      (request.payload as { request_id: string }).request_id,
    )}/respond`,
    payload: {
      session_id: session.id,
      participant_id: userId,
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
  expect(runner.calls.some((call) => call.includes("2"))).toBe(true);
  await expectTerminalAccessResponse(p, session.id);
  runner.verifyExpectationsConsumed();
  await app.close();
  await cleanup();
}

async function terminalApprovalHookCheck(): Promise<DetectResult> {
  return {
    installed: false,
    configPath: "(manual-stream mode)",
    detectedEntries: [],
    expectedEntries: [],
  };
}

async function spawnTerminalApprovalAgent(
  app: FastifyInstance,
  sessionId: string,
): Promise<string> {
  const spawn = await app.inject({
    method: "POST",
    url: "/managed-agents/spawn",
    payload: {
      runtime_id: "claude",
      suggested_participant_id: "ag-terminal",
      session_id: sessionId,
    },
  });
  expect(spawn.statusCode).toBe(200);
  return spawn.json().tmux_session as string;
}

function expectTerminalPromptCapture(
  runner: Parameters<typeof getNewSessionCall>[0],
  tmuxSession: string,
  root: string,
): void {
  runner.expect(["tmux", "display-message"], {
    stdout: "0\n",
    stderr: "",
    exitCode: 0,
  });
  runner.expect(["tmux", "capture-pane"], {
    stdout: terminalPrompt(),
    stderr: "",
    exitCode: 0,
  });
  expectManagedAgentsListSessions(runner, root, tmuxSession);
}

function terminalPrompt(): string {
  return [
    "Bash command",
    "ls /tmp && timeout 10 ./node_modules/.bin/tsx src/index.ts mcp",
    "Do you want to proceed?",
    "› 1. Yes",
    "  2. Yes, and allow access to .bin/ and timeout 10 commands",
    "  3. No",
  ].join("\n");
}

async function expectTerminalAccessRequest(
  p: Parameters<typeof userParticipantId>[0],
  sessionId: string,
  bus: ReturnType<typeof fakeBus>,
): Promise<{ participant_id: string; payload: unknown }> {
  const request = (await readEvents(p, sessionId, { kinds: ["access-request"] }))
    .find((event) => event.kind === "access-request");
  expect(request).toBeDefined();
  expect(request?.participant_id).toBe("ag-terminal");
  expect(request?.payload).toMatchObject({
    response_channel: "terminal",
    hook_event_name: "TerminalPermissionPrompt",
    command: expect.stringContaining("timeout 10"),
    suggestions: [
      expect.objectContaining({ id: "terminal:1", terminal_input: "1" }),
      expect.objectContaining({
        id: "terminal:2",
        terminal_input: "2",
        scope: "always",
      }),
      expect.objectContaining({ id: "terminal:3", terminal_input: "3" }),
    ],
  });
  expect(bus.messages.some((message) => message.type === "event_added")).toBe(true);
  return request!;
}

function expectTerminalResponseTmuxSend(
  runner: Parameters<typeof getNewSessionCall>[0],
  tmuxSession: string,
  root: string,
): void {
  expectManagedAgentsListSessions(runner, root, tmuxSession);
  /* Respond re-captures the pane and confirms the same prompt is still on
     screen before delivering; the fingerprint matches, so delivery proceeds. */
  runner.expect(["tmux", "capture-pane"], {
    stdout: terminalPrompt(),
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
  expectManagedAgentsListSessions(runner, root, tmuxSession);
}

async function expectTerminalAccessResponse(
  p: Parameters<typeof userParticipantId>[0],
  sessionId: string,
): Promise<void> {
  const accessResponse = (await readEvents(p, sessionId, {
    kinds: ["access-response"],
  })).find((event) => event.kind === "access-response");
  expect(accessResponse?.payload).toMatchObject({
    option_id: "terminal:2",
    terminal_input: "2",
    scope: "always",
    delivery: "terminal",
  });
}
