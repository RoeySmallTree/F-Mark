import { readFile } from "fs/promises";
import { randomUUID } from "node:crypto";
import type {
  AccessRequestPayload,
  AccessResponsePayload,
  AccessResponseDecision,
  ProsePayload,
  SubagentStatus,
} from "@f-mark/shared";
import { paths as makePaths } from "../paths.js";
import { isValidParticipantId } from "../participants.js";
import { listSessions, sessionExists } from "../sessions.js";
import { loadHookContext } from "./bootstrap.js";
import { createHookAgentStateStore } from "../services/agentState.js";
import { readEvents } from "../events/reader.js";
import {
  postAccessRequest,
  postAccessResponse,
  postPing,
  postProjectedEvents,
  postRuntimeState,
} from "./post.js";
import { getAdapter } from "../runtimes/adapters/index.js";
import { projectTurnToEvents, type ProjectedEvent } from "./projectTurn.js";
import { extractLastAssistantTurn } from "./transcript.js";
import { isFmarkLaunchPrompt } from "../launchPrompt.js";

export type AutoStreamKind = "assistant" | "user";

interface AssistantStdin {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: string;
  stop_hook_active?: boolean;
}

interface UserStdin {
  cwd: string;
  hook_event_name: string;
  prompt?: string;
  user_input?: string;
}

type HookPayload = AssistantStdin | UserStdin | Record<string, unknown>;

interface AutoStreamOptions {
  env?: NodeJS.ProcessEnv;
}

async function resolveParticipantId(
  explicitParticipantId: string | null,
  _kind: AutoStreamKind,
  _payload: HookPayload,
  _ctx: Awaited<ReturnType<typeof loadHookContext>>,
  env: NodeJS.ProcessEnv,
): Promise<string | null> {
  const envParticipantId = env.F_MARK_AGENT_ID;
  if (typeof envParticipantId !== "string" || envParticipantId.length === 0) {
    process.stderr.write(
      "f-mark auto-stream: F_MARK_AGENT_ID is not set; unmanaged hook ignored\n",
    );
    return null;
  }
  if (!isValidParticipantId(envParticipantId)) {
    process.stderr.write(
      `f-mark auto-stream: invalid F_MARK_AGENT_ID: ${envParticipantId}\n`,
    );
    return null;
  }

  if (explicitParticipantId === null) return envParticipantId;
  if (isValidParticipantId(explicitParticipantId)) return explicitParticipantId;
  process.stderr.write(
    `f-mark auto-stream: invalid participant id: ${explicitParticipantId}\n`,
  );
  return null;
}

async function resolveFmarkSessionId(
  ctx: Awaited<ReturnType<typeof loadHookContext>>,
  participantId: string,
  payload: HookPayload,
  env: NodeJS.ProcessEnv,
): Promise<string | null> {
  const agentState = createHookAgentStateStore({
    projectRoot: ctx.path,
    fmarkDir: ctx.fmarkDir,
    env,
  });
  const existing = await agentState.readActiveSession(participantId);
  if (existing) return existing;

  const p = makePaths(ctx.path);
  const payloadSessionIdRaw = (payload as { fmark_session_id?: unknown })
    .fmark_session_id;
  const payloadSessionId =
    typeof payloadSessionIdRaw === "string" ? payloadSessionIdRaw : null;
  const candidates = [env.F_MARK_SESSION_ID, payloadSessionId];
  for (const candidate of candidates) {
    if (
      typeof candidate === "string" &&
      candidate.length > 0 &&
      (await sessionExists(p, candidate))
    ) {
      await agentState.writeActiveSession(participantId, candidate);
      return candidate;
    }
  }

  const sessions = await listSessions(p);
  const latest = sessions[0]?.id;
  if (latest !== undefined) {
    await agentState.writeActiveSession(participantId, latest);
    return latest;
  }
  return null;
}

function stringField(input: unknown, key: string): string | undefined {
  if (input === null || typeof input !== "object") return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function runtimeIdFromEnv(env: NodeJS.ProcessEnv): string | null {
  const value = env.F_MARK_RUNTIME_ID;
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

/* Keys we try (in order) on a tool's `tool_input` when there's no
   `command` or `description` field. Covers the F-Mark MCP write surface:
   prose → `content`, todo → `title`, choices → `question`,
   html → `html`, file_ref/read_event → `path`/`filename`,
   register_agent → `name`, post_tool_use → `tool_name`, plus generic
   fallbacks for arbitrary tools. Falls back to a JSON preview when
   nothing matches.
   The cap applies only to the message preview — `tool_input` and `raw`
   are posted in full alongside it, so this is a display cap, not a
   payload-size guard. Real hook stdin is `JSON.parse`d, so circular
   refs cannot occur via the normal path; direct callers are expected
   to pass plain-data tool_input. */
const ACCESS_REQUEST_MESSAGE_KEYS = [
  "content",
  "text",
  "title",
  "prompt",
  "body",
  "html",
  "message",
  "question",
  "path",
  "filename",
  "name",
  "tool_name",
] as const;

const ACCESS_REQUEST_JSON_PREVIEW_LIMIT = 800;

function pickWellKnownMessageField(toolInput: unknown): string | undefined {
  if (toolInput === null || typeof toolInput !== "object") return undefined;
  for (const key of ACCESS_REQUEST_MESSAGE_KEYS) {
    const value = stringField(toolInput, key);
    if (value !== undefined) return value;
  }
  return undefined;
}

function jsonPreview(toolInput: unknown): string | undefined {
  if (toolInput === null || typeof toolInput !== "object") return undefined;
  try {
    const json = JSON.stringify(toolInput);
    if (typeof json !== "string" || json.length === 0) return undefined;
    if (json.length <= ACCESS_REQUEST_JSON_PREVIEW_LIMIT) return json;
    return `${json.slice(0, ACCESS_REQUEST_JSON_PREVIEW_LIMIT - 1)}…`;
  } catch {
    return undefined;
  }
}

function pickAccessRequestMessage(
  toolInput: unknown,
  preferred: string | undefined,
): string | undefined {
  if (preferred !== undefined) return preferred;
  return pickWellKnownMessageField(toolInput) ?? jsonPreview(toolInput);
}

export function extractAccessRequest(input: {
  payload: HookPayload;
  participantId: string;
  runtimeId: string | null;
}): AccessRequestPayload | null {
  const payload = input.payload as Record<string, unknown>;
  const hookEventName = stringField(payload, "hook_event_name");
  if (hookEventName === "PermissionRequest") {
    const toolInput = payload.tool_input;
    const command = stringField(toolInput, "command");
    const toolName = stringField(payload, "tool_name");
    const description = stringField(toolInput, "description");
    return {
      schema: "fmark.access-request.v1",
      request_id: `ar-${randomUUID()}`,
      status: "open",
      request_type: command !== undefined ? "command" : "tool",
      runtime_id: input.runtimeId ?? "claude",
      runtime_session_id: stringField(payload, "session_id"),
      runtime_turn_id: stringField(payload, "turn_id"),
      hook_event_name: hookEventName,
      title: toolName ?? "Permission request",
      message: pickAccessRequestMessage(toolInput, command ?? description),
      ...(toolName !== undefined ? { tool_name: toolName } : {}),
      ...(toolInput !== undefined ? { tool_input: toolInput } : {}),
      ...(command !== undefined ? { command } : {}),
      ...(stringField(payload, "permission_mode") !== undefined
        ? { permission_mode: stringField(payload, "permission_mode")! }
        : {}),
      ...(Array.isArray(payload.permission_suggestions)
        ? { suggestions: payload.permission_suggestions }
        : {}),
      ...(stringField(payload, "cwd") !== undefined
        ? { cwd: stringField(payload, "cwd")! }
        : {}),
      ...(stringField(payload, "transcript_path") !== undefined
        ? { transcript_path: stringField(payload, "transcript_path")! }
        : {}),
      response_channel: "hook",
      raw: payload,
      created_at: new Date().toISOString(),
    };
  }

  if (
    hookEventName === "Notification" &&
    stringField(payload, "notification_type") === "ToolPermission"
  ) {
    const details = payload.details;
    const command = stringField(details, "command");
    const title =
      stringField(details, "title") ??
      stringField(payload, "message") ??
      "Tool permission";
    /* For Gemini ToolPermission notifications, prefer detail-derived
       content (toolName/toolDisplayName, then the well-known key list)
       over the top-level `message`, which is usually generic boilerplate
       like "Tool Confirm MCP Tool Execution requires MCP". Only fall
       back to a JSON preview of details after exhausting both the
       structured detail fields and the top-level message — so a
       useful top-level message still wins over an opaque JSON dump. */
    const detailMessage =
      command ??
      stringField(details, "toolDisplayName") ??
      stringField(details, "toolName") ??
      pickWellKnownMessageField(details);
    const messageFallback = stringField(payload, "message");
    return {
      schema: "fmark.access-request.v1",
      request_id: `ar-${randomUUID()}`,
      status: "open",
      request_type: command !== undefined ? "command" : "permission",
      runtime_id: input.runtimeId ?? "gemini",
      runtime_session_id: stringField(payload, "session_id"),
      hook_event_name: hookEventName,
      title,
      message: detailMessage ?? messageFallback ?? jsonPreview(details),
      tool_name: stringField(details, "type") ?? "ToolPermission",
      ...(details !== undefined ? { tool_input: details } : {}),
      ...(command !== undefined ? { command } : {}),
      ...(stringField(payload, "cwd") !== undefined
        ? { cwd: stringField(payload, "cwd")! }
        : {}),
      ...(stringField(payload, "transcript_path") !== undefined
        ? { transcript_path: stringField(payload, "transcript_path")! }
        : {}),
      response_channel: "terminal",
      raw: payload,
      created_at: new Date().toISOString(),
    };
  }
  return null;
}

function objectField(input: unknown, key: string): Record<string, unknown> | null {
  if (input === null || typeof input !== "object") return null;
  const value = (input as Record<string, unknown>)[key];
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function pickStringField(
  input: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const direct = stringField(input, key);
    if (direct !== undefined) return direct;
  }
  const details = objectField(input, "details");
  if (details !== null) {
    for (const key of keys) {
      const value = stringField(details, key);
      if (value !== undefined) return value;
    }
  }
  return undefined;
}

function truncateString(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}

function finalSubagentMessage(payload: Record<string, unknown>): string | null {
  for (const key of [
    "last_assistant_message",
    "final_message",
    "result",
    "output",
    "content",
    "message",
  ]) {
    const value = stringField(payload, key);
    if (value !== undefined) return value;
  }
  const result = payload.result;
  if (Array.isArray(result)) {
    const joined = result
      .map((item) => {
        if (typeof item === "string") return item;
        if (item !== null && typeof item === "object") {
          return stringField(item, "text") ?? stringField(item, "content");
        }
        return undefined;
      })
      .filter((item): item is string => item !== undefined)
      .join("\n")
      .trim();
    return joined.length > 0 ? joined : null;
  }
  if (result !== undefined && result !== null && typeof result === "object") {
    const record = result as Record<string, unknown>;
    return (
      stringField(record, "last_assistant_message") ??
      stringField(record, "content") ??
      stringField(record, "output") ??
      stringField(record, "message") ??
      null
    );
  }
  return null;
}

function jsonResultText(value: string): string | null {
  const candidates = [value.trim()];
  const resultIndex = value.indexOf("Result:");
  if (resultIndex >= 0) candidates.unshift(value.slice(resultIndex + "Result:".length).trim());
  for (const candidate of candidates) {
    if (!candidate.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed === null || typeof parsed !== "object") continue;
      const record = parsed as Record<string, unknown>;
      const direct =
        stringField(record, "response") ??
        stringField(record, "result") ??
        stringField(record, "output") ??
        stringField(record, "message");
      if (direct !== undefined) return direct;
      const result = record.result;
      if (result !== undefined) {
        const nested = subagentToolResponseText(result);
        if (nested !== null) return nested;
      }
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function cleanSubagentText(value: string): string {
  return jsonResultText(value) ?? value;
}

function subagentToolResponseText(response: unknown): string | null {
  if (typeof response === "string") {
    const trimmed = response.trim();
    return trimmed.length > 0 ? cleanSubagentText(trimmed) : null;
  }
  if (Array.isArray(response)) {
    const joined = response
      .map((item) => {
        if (typeof item === "string") return cleanSubagentText(item);
        if (item !== null && typeof item === "object") {
          return (
            stringField(item, "text") ??
            stringField(item, "content") ??
            stringField(item, "llmContent") ??
            stringField(item, "returnDisplay")
          );
        }
        return undefined;
      })
      .filter((item): item is string => item !== undefined)
      .join("\n")
      .trim();
    return joined.length > 0 ? cleanSubagentText(joined) : null;
  }
  if (response === null || typeof response !== "object") return null;
  const record = response as Record<string, unknown>;
  if (record.returnDisplay !== undefined) {
    const display = subagentToolResponseText(record.returnDisplay);
    if (display !== null) return display;
  }
  const direct =
    stringField(record, "last_assistant_message") ??
    stringField(record, "content") ??
    stringField(record, "result") ??
    stringField(record, "output") ??
    stringField(record, "llmContent") ??
    stringField(record, "returnDisplay") ??
    stringField(record, "message");
  if (direct !== undefined) return cleanSubagentText(direct);
  if (Array.isArray(record.content) || Array.isArray(record.llmContent)) {
    return subagentToolResponseText(record.content ?? record.llmContent);
  }
  if (record.result !== undefined) return subagentToolResponseText(record.result);
  try {
    const json = JSON.stringify(response);
    return json.length > 2 ? json : null;
  } catch {
    return null;
  }
}

function subagentStopStatus(payload: Record<string, unknown>): SubagentStatus {
  const rawStatus =
    stringField(payload, "status") ?? stringField(payload, "outcome") ?? "";
  const lowered = rawStatus.toLowerCase();
  if (lowered === "failed" || lowered === "error") return "failed";
  if (lowered === "cancelled" || lowered === "canceled") return "cancelled";
  if (payload.error !== undefined || payload.is_error === true) return "failed";
  return "completed";
}

function extractSubagentToolHookEvents(input: {
  payload: Record<string, unknown>;
  participantId: string;
  runtimeId: string | null;
}): ProjectedEvent[] {
  const hookEventName = stringField(input.payload, "hook_event_name");
  const toolName = stringField(input.payload, "tool_name");
  if (toolName === undefined) return [];
  const normalizedTool = toolName.toLowerCase();
  const isClaudeAgent =
    (hookEventName === "PostToolUse" || hookEventName === "AfterTool") &&
    (normalizedTool === "agent" || normalizedTool === "task");
  const isGeminiAgent =
    hookEventName === "AfterTool" && normalizedTool === "invoke_agent";
  if (!isClaudeAgent && !isGeminiAgent) return [];

  const rawInput =
    objectField(input.payload, "tool_input") ??
    objectField(input.payload, "input") ??
    objectField(input.payload, "parameters") ??
    {};
  const parameters = objectField(rawInput, "parameters");
  const toolInput = parameters !== null ? { ...rawInput, ...parameters } : rawInput;
  const response =
    input.payload.tool_response ??
    input.payload.tool_result ??
    input.payload.response ??
    input.payload.result;
  const now = new Date().toISOString();
  const name = truncateString(
    pickStringField(toolInput, [
      "subagent_type",
      "agent_type",
      "agent_name",
      "name",
      "description",
    ]) ?? (isGeminiAgent ? "Gemini sub-agent" : "Claude sub-agent"),
    160,
  );
  const subagentId = truncateString(
    pickStringField(toolInput, ["agent_id", "subagent_id", "id", "agent_name"]) ??
      `${toolName}-${randomUUID()}`,
    160,
  );
  const parentToolUseId =
    stringField(input.payload, "tool_use_id") ??
    stringField(input.payload, "tool_call_id") ??
    stringField(input.payload, "original_request_name");
  const runtimeSessionId = stringField(input.payload, "session_id");
  const parentTurnId = stringField(input.payload, "turn_id");
  const status: SubagentStatus =
    input.payload.error !== undefined ||
    (response !== null &&
      typeof response === "object" &&
      (response as Record<string, unknown>).error !== undefined)
      ? "failed"
      : "completed";
  const correlationId = truncateString(
    parentToolUseId ??
      `${runtimeSessionId ?? input.runtimeId ?? "runtime"}:${toolName}:${now}`,
    180,
  );
  const promptPreview = pickStringField(toolInput, [
    "prompt",
    "task",
    "instructions",
  ]);
  const run: ProjectedEvent = {
    kind: "subagent-run",
    schema: "fmark.subagent-run.v1",
    parent_participant_id: input.participantId,
    parent_runtime_id: input.runtimeId ?? (isGeminiAgent ? "gemini" : "claude"),
    ...(runtimeSessionId !== undefined
      ? { parent_runtime_session_id: runtimeSessionId }
      : {}),
    ...(parentTurnId !== undefined ? { parent_turn_id: parentTurnId } : {}),
    ...(parentToolUseId !== undefined
      ? { parent_tool_use_id: parentToolUseId }
      : {}),
    subagent_id: subagentId,
    name,
    role: pickStringField(toolInput, ["role", "agent_role"]),
    ...(promptPreview !== undefined
      ? { prompt_preview: truncateString(promptPreview, 4000) }
      : {}),
    status,
    started_at: now,
    ended_at: now,
    correlation_id: correlationId,
    sequence: 0,
    source: "hook",
    source_confidence: "high",
    raw: input.payload,
  };
  const content = subagentToolResponseText(response);
  if (content === null) return [run];
  const output: ProjectedEvent = {
    kind: "subagent-output",
    schema: "fmark.subagent-output.v1",
    parent_participant_id: input.participantId,
    parent_runtime_id: run.parent_runtime_id,
    ...(runtimeSessionId !== undefined
      ? { parent_runtime_session_id: runtimeSessionId }
      : {}),
    ...(parentTurnId !== undefined ? { parent_turn_id: parentTurnId } : {}),
    ...(parentToolUseId !== undefined
      ? { parent_tool_use_id: parentToolUseId }
      : {}),
    subagent_id: subagentId,
    name,
    content,
    arbitrary: false,
    status,
    correlation_id: correlationId,
    sequence: 1,
    source: "hook",
    source_confidence: "high",
    raw: input.payload,
  };
  return [run, output];
}

function extractSubagentHookEvents(input: {
  payload: HookPayload;
  participantId: string;
  runtimeId: string | null;
}): ProjectedEvent[] {
  const payload = input.payload as Record<string, unknown>;
  const hookEventName = stringField(payload, "hook_event_name");
  if (hookEventName !== "SubagentStart" && hookEventName !== "SubagentStop") {
    return extractSubagentToolHookEvents({
      payload,
      participantId: input.participantId,
      runtimeId: input.runtimeId,
    });
  }
  const now = new Date().toISOString();
  const subagentId = truncateString(
    pickStringField(payload, ["agent_id", "subagent_id", "id"]) ??
      `subagent-${randomUUID()}`,
    160,
  );
  const name = truncateString(
    pickStringField(payload, [
      "subagent_type",
      "agent_type",
      "agent_name",
      "name",
      "description",
    ]) ?? "Sub-agent",
    160,
  );
  const correlationId = truncateString(
    pickStringField(payload, ["correlation_id", "tool_use_id", "turn_id"]) ??
      subagentId,
    180,
  );
  const parentToolUseId = pickStringField(payload, ["tool_use_id"]);
  const parentTurnId = pickStringField(payload, ["turn_id"]);
  const runtimeSessionId = pickStringField(payload, ["session_id"]);
  const status: SubagentStatus =
    hookEventName === "SubagentStart" ? "started" : subagentStopStatus(payload);
  const run: ProjectedEvent = {
    kind: "subagent-run",
    schema: "fmark.subagent-run.v1",
    parent_participant_id: input.participantId,
    parent_runtime_id: input.runtimeId,
    ...(runtimeSessionId !== undefined
      ? { parent_runtime_session_id: runtimeSessionId }
      : {}),
    ...(parentTurnId !== undefined ? { parent_turn_id: parentTurnId } : {}),
    ...(parentToolUseId !== undefined
      ? { parent_tool_use_id: parentToolUseId }
      : {}),
    subagent_id: subagentId,
    name,
    role: pickStringField(payload, ["role", "agent_role"]),
    prompt_preview:
      pickStringField(payload, ["prompt", "task", "instructions"]) !== undefined
        ? truncateString(
            pickStringField(payload, ["prompt", "task", "instructions"])!,
            4000,
          )
        : undefined,
    status,
    started_at: hookEventName === "SubagentStart" ? now : undefined,
    ended_at: hookEventName === "SubagentStop" ? now : undefined,
    transcript_path: pickStringField(payload, [
      "agent_transcript_path",
      "transcript_path",
    ]),
    correlation_id: correlationId,
    sequence: 0,
    source: "hook",
    source_confidence: "high",
    raw: payload,
  };
  if (hookEventName === "SubagentStart") return [run];
  const finalMessage = finalSubagentMessage(payload);
  if (finalMessage === null) return [run];
  const output: ProjectedEvent = {
    kind: "subagent-output",
    schema: "fmark.subagent-output.v1",
    parent_participant_id: input.participantId,
    parent_runtime_id: input.runtimeId,
    ...(runtimeSessionId !== undefined
      ? { parent_runtime_session_id: runtimeSessionId }
      : {}),
    ...(parentTurnId !== undefined ? { parent_turn_id: parentTurnId } : {}),
    ...(parentToolUseId !== undefined
      ? { parent_tool_use_id: parentToolUseId }
      : {}),
    subagent_id: subagentId,
    name,
    content: finalMessage,
    arbitrary: false,
    status,
    correlation_id: correlationId,
    sequence: 1,
    source: "hook",
    source_confidence: "high",
    raw: payload,
  };
  return [run, output];
}

function isFmarkMcpToolName(name: string): boolean {
  return name.startsWith("mcp__fmark__");
}

function isClaudeSubagentToolName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === "agent" || lower === "task";
}

function nonEmptyError(value: unknown): boolean {
  /* `error: null` / `error: ""` are common "no error" sentinels. Only
     treat `error` as a failure signal when it actually contains
     something. */
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function looksFailedStatus(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const lower = value.toLowerCase();
  return lower === "failed" || lower === "error" || lower === "cancelled" || lower === "canceled";
}

function toolUseIsSuccessful(payload: Record<string, unknown>): boolean {
  if (nonEmptyError(payload.error)) return false;
  if (payload.is_error === true) return false;
  if (payload.isError === true) return false;
  const response =
    payload.tool_response ?? payload.tool_result ?? payload.response ?? payload.result;
  if (response !== null && typeof response === "object" && !Array.isArray(response)) {
    const record = response as Record<string, unknown>;
    if (nonEmptyError(record.error)) return false;
    if (record.is_error === true) return false;
    if (record.isError === true) return false;
    if (looksFailedStatus(record.status)) return false;
    if (looksFailedStatus(record.outcome)) return false;
  }
  return true;
}

/**
 * Project a Claude `PostToolUse` hook payload into a single `tool-use`
 * event for live streaming during a turn. Returns `null` when the hook
 * is not a PostToolUse event, when the tool is a Claude sub-agent
 * dispatch (handled separately as `subagent-run`/`subagent-output`),
 * or when the tool is one of the fmark MCP tools (those write their own
 * events from the MCP server, so live-capturing them here would
 * produce a duplicate tool-use card alongside the structured event).
 */
export function extractPostToolUseEvent(input: {
  payload: HookPayload;
  participantId: string;
  runtimeId: string | null;
}): ProjectedEvent | null {
  const payload = input.payload as Record<string, unknown>;
  const hookEventName = stringField(payload, "hook_event_name");
  if (hookEventName !== "PostToolUse") return null;
  const toolName = stringField(payload, "tool_name");
  if (toolName === undefined) return null;
  if (isClaudeSubagentToolName(toolName)) return null;
  if (isFmarkMcpToolName(toolName)) return null;
  const toolUseId =
    stringField(payload, "tool_use_id") ??
    stringField(payload, "tool_call_id");
  if (toolUseId === undefined) return null;
  const rawInput = objectField(payload, "tool_input") ?? objectField(payload, "input");
  const result =
    payload.tool_response ?? payload.tool_result ?? payload.response ?? payload.result;
  return {
    kind: "tool-use",
    tool_name: toolName,
    tool_use_id: toolUseId,
    input: rawInput ?? {},
    result: result ?? null,
    success: toolUseIsSuccessful(payload),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function accessResponseForDecision(
  response: AccessResponsePayload,
): Extract<AccessResponseDecision, "approve" | "deny"> | null {
  if (response.decision === "approve" || response.decision === "deny") {
    return response.decision;
  }
  return null;
}

async function findAccessResponse(input: {
  projectRoot: string;
  sessionId: string;
  requestId: string;
}): Promise<AccessResponsePayload | null> {
  const events = await readEvents(makePaths(input.projectRoot), input.sessionId, {
    kinds: ["access-response"],
  });
  const responses = events
    .filter((event) => event.kind === "access-response")
    .map((event) => event.payload as AccessResponsePayload)
    .filter((payload) => payload.request_id === input.requestId)
    .sort((a, b) => a.responded_at.localeCompare(b.responded_at));
  return responses.at(-1) ?? null;
}

function permissionHookOutput(input: {
  runtimeId: string | null;
  decision: Extract<AccessResponseDecision, "approve" | "deny">;
  message?: string;
}): string {
  const behavior = input.decision === "approve" ? "allow" : "deny";
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision:
        behavior === "allow"
          ? { behavior }
          : { behavior, message: input.message ?? "Denied by F-Mark" },
    },
  });
}

function normalizeFinalText(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

async function hasMatchingMcpFinalProse(input: {
  projectRoot: string;
  sessionId: string;
  participantId: string;
  content: string;
}): Promise<boolean> {
  const target = normalizeFinalText(input.content);
  const events = await readEvents(makePaths(input.projectRoot), input.sessionId, {
    participant: input.participantId,
  });
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event === undefined) continue;
    if (event.kind !== "prose") {
      if (event.kind === "turn-end") continue;
      return false;
    }
    const payload = event.payload as ProsePayload;
    if (payload.arbitrary === true) return false;
    if (
      payload.source === "mcp" &&
      normalizeFinalText(payload.content) === target
    ) {
      return true;
    }
    return false;
  }
  return false;
}

/**
 * Returns the set of `tool_use_id`s already recorded as `tool-use` events
 * for this participant in this session. Used at Stop to dedupe tool-use
 * events that already streamed live via PostToolUse hooks.
 */
async function existingToolUseIds(input: {
  projectRoot: string;
  sessionId: string;
  participantId: string;
}): Promise<Set<string>> {
  const events = await readEvents(makePaths(input.projectRoot), input.sessionId, {
    participant: input.participantId,
    kinds: ["tool-use"],
  });
  const ids = new Set<string>();
  for (const event of events) {
    if (event.kind !== "tool-use") continue;
    const payload = event.payload as { tool_use_id?: unknown } | null;
    if (payload !== null && typeof payload?.tool_use_id === "string") {
      ids.add(payload.tool_use_id);
    }
  }
  return ids;
}

async function dedupeHookFinalProse(input: {
  projectRoot: string;
  sessionId: string;
  participantId: string;
  events: ProjectedEvent[];
}): Promise<ProjectedEvent[]> {
  const out: ProjectedEvent[] = [];
  /* Only fetch existing tool-use ids when this batch actually contains
     tool-use events. The session-feed scan is non-trivial and would
     unnecessarily fail on tests/setups where the session directory
     doesn't exist (e.g. the ping-only fixture). */
  const hasToolUse = input.events.some((event) => event.kind === "tool-use");
  let seenToolUseIds: Set<string> = new Set();
  if (hasToolUse) {
    try {
      seenToolUseIds = await existingToolUseIds({
        projectRoot: input.projectRoot,
        sessionId: input.sessionId,
        participantId: input.participantId,
      });
    } catch {
      /* If we can't read existing tool-use events (e.g. missing
         session), proceed without dedup. Posting a possible duplicate
         is better than dropping the whole batch. */
    }
  }
  for (const event of input.events) {
    if (event.kind === "tool-use") {
      /* Drop fmark MCP tool-use events at Stop too. The MCP server
         already writes the structured event (prose/todo/etc.) when the
         agent calls the tool; projecting the transcript-level tool_use
         block on top would add a generic "tool-use mcp__fmark__…" card
         next to the structured one. Live PostToolUse suppression
         handles the same case (#5), but the transcript projection still
         runs at Stop and needs the same filter. */
      if (isFmarkMcpToolName(event.tool_name)) continue;
      if (seenToolUseIds.has(event.tool_use_id)) continue;
    }
    if (
      event.kind === "prose" &&
      !event.arbitrary &&
      (await hasMatchingMcpFinalProse({
        projectRoot: input.projectRoot,
        sessionId: input.sessionId,
        participantId: input.participantId,
        content: event.content,
      }))
    ) {
      continue;
    }
    out.push(event);
  }
  return out;
}

async function handleAccessRequest(input: {
  ctx: Awaited<ReturnType<typeof loadHookContext>>;
  participantId: string;
  sessionId: string;
  request: AccessRequestPayload;
  env: NodeJS.ProcessEnv;
}): Promise<void> {
  await postAccessRequest(input.ctx, input.sessionId, {
    participant_id: input.participantId,
    ...input.request,
  });

  if (input.request.response_channel !== "hook") return;

  const timeoutRaw = input.env.F_MARK_ACCESS_REQUEST_TIMEOUT_MS;
  const timeoutMs =
    typeof timeoutRaw === "string" && Number.isFinite(Number(timeoutRaw))
      ? Math.max(1, Number(timeoutRaw))
      : 300_000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await findAccessResponse({
      projectRoot: input.ctx.path,
      sessionId: input.sessionId,
      requestId: input.request.request_id,
    });
    if (response !== null) {
      const decision = accessResponseForDecision(response);
      if (decision !== null) {
        process.stdout.write(
          `${permissionHookOutput({
            runtimeId: input.request.runtime_id,
            decision,
            message: response.message,
          })}\n`,
        );
        return;
      }
    }
    await sleep(250);
  }

  await postAccessResponse(input.ctx, input.sessionId, {
    participant_id: input.participantId,
    schema: "fmark.access-response.v1",
    request_id: input.request.request_id,
    decision: "expired",
    status: "expired",
    delivered: false,
    delivery: "hook",
    error: "Timed out waiting for a F-Mark access response",
    responded_at: new Date().toISOString(),
  });
}

/* Best-effort runtime-state probe. Reads the current model/effort via
   the runtime adapter and POSTs it to the kernel so the UI can render a
   live badge. Adapter returns null for runtimes without a probe path,
   so this no-ops for gemini / custom / opencode-via-autoStream. */
async function maybePostRuntimeState(input: {
  ctx: import("./bootstrap.js").HookContext;
  participantId: string;
  runtimeId: string | null;
  payload: HookPayload;
}): Promise<void> {
  const adapter = getAdapter(input.runtimeId);
  if (!adapter) return;
  const transcriptPath = (input.payload as { transcript_path?: string })
    .transcript_path;
  const cwd = (input.payload as { cwd?: string }).cwd;
  try {
    const state = await adapter.readCurrent({
      transcriptPath,
      cwd,
    });
    if (state) {
      await postRuntimeState(input.ctx, input.participantId, state);
    }
  } catch {
    // best-effort; runtime state is a UX nice-to-have
  }
}

export async function runAutoStream(
  explicitParticipantId: string | null,
  kind: AutoStreamKind,
  stdinRaw: string,
  options: AutoStreamOptions = {},
): Promise<number> {
  let payload: HookPayload;
  try {
    payload = JSON.parse(stdinRaw);
  } catch {
    process.stderr.write("f-mark auto-stream: invalid JSON on stdin\n");
    return 0;
  }

  const env = options.env ?? process.env;

  if (kind === "user") {
    const u = payload as UserStdin;
    const text = u.prompt ?? u.user_input ?? "";
    if (isFmarkLaunchPrompt(text)) return 0;
  }

  const cwd = (payload as { cwd?: string }).cwd ?? process.cwd();
  let ctx;
  try {
    ctx = await loadHookContext(cwd, env);
  } catch (err: any) {
    process.stderr.write(`f-mark auto-stream: ${err.message}\n`);
    return 0;
  }

  let participantId: string | null;
  try {
    participantId = await resolveParticipantId(
      explicitParticipantId,
      kind,
      payload,
      ctx,
      env,
    );
  } catch (err: any) {
    process.stderr.write(`f-mark auto-stream: ${err.message}\n`);
    return 0;
  }
  if (!participantId) return 0;

  const sessionId = await resolveFmarkSessionId(ctx, participantId, payload, env);
  if (!sessionId) {
    process.stderr.write(
      `f-mark auto-stream: no F-Mark session found for ${participantId}; create a session first\n`,
    );
    return 0;
  }

  await postPing(ctx, participantId);
  const runtimeId = runtimeIdFromEnv(env);

  /* Gate runtime-state probes to turn boundaries — Stop, PostToolUse, and
     codex/opencode AfterTool. Per review_2.md §1: model/effort only changes
     on respawn, so probing every hook event wastes I/O AND can delay
     permission prompts that share this code path. */
  const hookEventName = stringField(payload, "hook_event_name");
  if (
    hookEventName === "Stop" ||
    hookEventName === "PostToolUse" ||
    hookEventName === "AfterTool"
  ) {
    await maybePostRuntimeState({
      ctx,
      participantId,
      runtimeId,
      payload,
    });
  }

  const accessRequest = extractAccessRequest({
    payload,
    participantId,
    runtimeId,
  });
  if (accessRequest !== null) {
    try {
      await handleAccessRequest({
        ctx,
        participantId,
        sessionId,
        request: accessRequest,
        env,
      });
    } catch (err: any) {
      process.stderr.write(`f-mark auto-stream: access request → ${err.message}\n`);
    }
    return 0;
  }

  if (kind === "assistant") {
    const subagentEvents = extractSubagentHookEvents({
      payload,
      participantId,
      runtimeId,
    });
    if (subagentEvents.length > 0) {
      try {
        await postProjectedEvents(ctx, participantId, sessionId, subagentEvents, {
          emitTurnEnd: false,
        });
      } catch (err: any) {
        process.stderr.write(
          `f-mark auto-stream: sub-agent capture -> ${err.message}\n`,
        );
      }
      return 0;
    }

    /* PostToolUse → stream a single tool-use event live during the turn.
       Branch explicitly on the hook name so a suppressed PostToolUse
       (fmark MCP tool, malformed payload, etc.) doesn't fall through to
       the Stop transcript projection below — that would post a turn-end
       mid-turn. The Stop branch's `dedupeHookFinalProse` filters out
       any tool_use_id we've already posted live so the renderer doesn't
       show a duplicate card at end-of-turn. */
    if (stringField(payload, "hook_event_name") === "PostToolUse") {
      const toolUseEvent = extractPostToolUseEvent({
        payload,
        participantId,
        runtimeId,
      });
      if (toolUseEvent !== null) {
        try {
          await postProjectedEvents(ctx, participantId, sessionId, [toolUseEvent], {
            emitTurnEnd: false,
          });
        } catch (err: any) {
          process.stderr.write(
            `f-mark auto-stream: tool-use capture -> ${err.message}\n`,
          );
        }
      }
      return 0;
    }

    const a = payload as AssistantStdin;
    if (a.stop_hook_active === true) return 0;
    let transcript: string;
    try {
      transcript = await readFile(a.transcript_path, "utf8");
    } catch (err: any) {
      process.stderr.write(
        `f-mark auto-stream: cannot read transcript ${a.transcript_path}: ${err.message}\n`,
      );
      return 0;
    }
    const blocks = extractLastAssistantTurn(transcript);
    const events = projectTurnToEvents(blocks, {
      parentParticipantId: participantId,
      parentRuntimeId: runtimeId,
      parentRuntimeSessionId: stringField(payload, "session_id"),
      parentTurnId: stringField(payload, "turn_id"),
    });
    const dedupedEvents = await dedupeHookFinalProse({
      projectRoot: ctx.path,
      sessionId,
      participantId,
      events,
    });
    if (dedupedEvents.length === 0) return 0;
    await postProjectedEvents(ctx, participantId, sessionId, dedupedEvents);
    return 0;
  }

  // kind === "user"
  const u = payload as UserStdin;
  const text = (u.prompt ?? u.user_input ?? "").trim();
  if (!text) return 0;
  // User prompts post a single prose event and never emit turn-end (turns are
  // owned by assistants).
  try {
    await postProjectedEvents(
      ctx,
      participantId,
      sessionId,
      [{ kind: "prose", content: text, arbitrary: false }],
      { emitTurnEnd: false },
    );
  } catch (err: any) {
    process.stderr.write(`f-mark auto-stream: POST /events/prose → ${err.message}\n`);
  }
  return 0;
}
