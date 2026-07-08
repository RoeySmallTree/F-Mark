import { mkdir, mkdtemp, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { expect, vi } from "vitest";
import { writeActiveSession } from "../../../src/agents/activeSession.js";
import {
  type AutoStreamKind,
  runAutoStream,
} from "../../../src/hooks/autoStream.js";
import { globalPaths } from "../../../src/paths/global.js";
import { computePathId } from "../../../src/paths/identity.js";

type HookPayload = Record<string, unknown>;
type RunOptions = { env?: NodeJS.ProcessEnv };

export type BootstrappedProject = {
  dir: string;
  fmark: string;
  transcript: string;
};

export type FetchMock = ReturnType<typeof vi.fn>;

export async function bootstrapProject(): Promise<BootstrappedProject> {
  const dir = await mkdtemp(join(tmpdir(), "fm-"));
  const fmark = join(dir, ".f-mark");
  await mkdir(fmark, { recursive: true });
  await writeFile(join(fmark, ".token"), "tok-1", "utf8");
  await writeFile(
    join(fmark, "config.json"),
    JSON.stringify({ version: "0.1.0", port: 7777, participants: {} }),
    "utf8",
  );
  await mkdir(join(fmark, "sessions", "sess-1"), { recursive: true });
  await writeLocalActiveSession(fmark, "ag-claude");

  const transcript = join(dir, "transcript.jsonl");
  await writeJsonl(transcript, [
    { role: "user", content: [{ type: "text", text: "hi" }] },
    { role: "assistant", content: [{ type: "text", text: "hello!" }] },
  ]);

  return { dir, fmark, transcript };
}

export function managedEnv(
  participantId = "ag-claude",
  userParticipantId?: string,
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    F_MARK_AGENT_ID: participantId,
    ...(userParticipantId !== undefined
      ? { F_MARK_USER_ID: userParticipantId }
      : {}),
  };
}

export async function runHookExitZero(
  participantId: string | null,
  kind: AutoStreamKind,
  payload: HookPayload,
  options?: RunOptions,
): Promise<FetchMock> {
  const exit = await runAutoStream(
    participantId,
    kind,
    JSON.stringify(payload),
    options,
  );
  expect(exit).toBe(0);
  return fetchMock();
}

export async function runAssistantHook(
  payload: HookPayload,
  options: RunOptions & { participantId?: string | null } = {},
): Promise<FetchMock> {
  const participantId =
    options.participantId === undefined ? "ag-claude" : options.participantId;
  return runHookExitZero(participantId, "assistant", payload, {
    env: options.env ?? managedEnv(),
  });
}

export async function runUserHook(
  participantId: string,
  payload: HookPayload,
  options?: RunOptions,
): Promise<FetchMock> {
  return runHookExitZero(participantId, "user", payload, options);
}

export function stopPayload(
  dir: string,
  transcript: string,
  overrides: HookPayload = {},
): HookPayload {
  return {
    session_id: "claude-1",
    transcript_path: transcript,
    cwd: dir,
    hook_event_name: "Stop",
    stop_hook_active: false,
    ...overrides,
  };
}

export function messageDisplayPayload(
  dir: string,
  overrides: HookPayload,
): HookPayload {
  return {
    session_id: "claude-1",
    cwd: dir,
    hook_event_name: "MessageDisplay",
    ...overrides,
  };
}

export function postToolUsePayload(
  dir: string,
  overrides: HookPayload,
): HookPayload {
  return {
    session_id: "claude-1",
    cwd: dir,
    hook_event_name: "PostToolUse",
    ...overrides,
  };
}

function fetchMock(): FetchMock {
  return globalThis.fetch as unknown as FetchMock;
}

function fetchUrls(fetch = fetchMock()): string[] {
  return fetch.mock.calls.map((call) => String(call[0]));
}

function eventCount(suffix: string, fetch = fetchMock()): number {
  return fetchUrls(fetch).filter((url) => url.endsWith(suffix)).length;
}

export function expectEventCount(
  suffix: string,
  expected: number,
  fetch = fetchMock(),
): void {
  expect(eventCount(suffix, fetch)).toBe(expected);
}

export function expectNoEventPosts(
  fetch: FetchMock,
  ...suffixes: string[]
): void {
  for (const suffix of suffixes) expectEventCount(suffix, 0, fetch);
}

export function expectConcludingProseWithoutToolUse(fetch: FetchMock): void {
  expectEventCount("/events/tool-use", 0, fetch);
  expectEventCount("/events/prose", 1, fetch);
  expectEventCount("/events/turn-end", 1, fetch);
}

export function expectPing(fetch: FetchMock, participantId: string): void {
  expect(fetch.mock.calls[0][0]).toContain(`/agents/${participantId}/ping`);
}

export function expectPostUrl(
  fetch: FetchMock,
  callIndex: number,
  urlFragment: string,
): void {
  expect(fetch.mock.calls[callIndex][0]).toContain(urlFragment);
}

export function jsonBodyAt(fetch: FetchMock, callIndex: number): unknown {
  return JSON.parse(String(fetch.mock.calls[callIndex][1].body));
}

export function findCallByUrl(
  fetch: FetchMock,
  predicate: (url: string) => boolean,
): unknown[] | undefined {
  return fetch.mock.calls.find((call) => predicate(String(call[0])));
}

export function jsonBodyOf(call: unknown[]): unknown {
  return JSON.parse(String((call as any)[1].body));
}

export async function writeSessionEvent(
  fmark: string,
  filename: string,
  contents: string,
): Promise<void> {
  await writeFile(join(fmark, "sessions", "sess-1", filename), contents, "utf8");
}

export async function writeMcpTurnEnd(fmark: string): Promise<void> {
  await writeSessionEvent(
    fmark,
    "20260101T000000.000Z_ag-claude.turn-end.json",
    JSON.stringify({ participant_id: "ag-claude", source: "mcp" }, null, 2),
  );
}

export async function writeHookProse(
  fmark: string,
  content: string,
): Promise<void> {
  await writeSessionEvent(
    fmark,
    "20260101T000000.000Z_ag-claude.prose.md",
    `---\nsource: hook\narbitrary: true\n---\n${content}\n`,
  );
}

export async function writeJsonl(
  path: string,
  entries: unknown[],
): Promise<void> {
  await writeFile(path, entries.map((entry) => JSON.stringify(entry)).join("\n"), "utf8");
}

export async function writeTranscript(
  dir: string,
  filename: string,
  entries: unknown[],
): Promise<string> {
  const path = join(dir, filename);
  await writeJsonl(path, entries);
  return path;
}

export async function writeLocalActiveSession(
  fmark: string,
  participantId: string,
  sessionId = "sess-1",
): Promise<void> {
  await writeActiveSession(join(fmark, "agents"), participantId, sessionId);
}

export async function writeGlobalActiveSession(
  projectDir: string,
  xdgConfigHome: string,
  participantId: string,
  sessionId: string,
): Promise<void> {
  const g = globalPaths(join(xdgConfigHome, "f-mark"));
  await writeActiveSession(
    g.projectAgentsDir(computePathId(projectDir)),
    participantId,
    sessionId,
  );
}

export async function readRuntimeSession(
  projectDir: string,
  xdgConfigHome: string,
  participantId = "ag-claude",
): Promise<unknown> {
  const g = globalPaths(join(xdgConfigHome, "f-mark"));
  const raw = await readFile(
    join(g.projectAgentsDir(computePathId(projectDir)), participantId, "runtime-session.json"),
    "utf8",
  );
  return JSON.parse(raw);
}
