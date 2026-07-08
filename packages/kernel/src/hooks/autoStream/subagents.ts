import { randomUUID } from "node:crypto";
import type { SubagentRunPayload, SubagentStatus } from "@f-mark/shared";
import type { ProjectedEvent } from "../projectTurn.js";
import type { HookPayload } from "./types.js";
import {
  objectField,
  pickStringField,
  stringField,
  truncateString,
} from "./fields.js";

interface SubagentInput {
  payload: Record<string, unknown>;
  participantId: string;
  runtimeId: string | null;
}

interface SubagentContext extends SubagentInput {
  toolInput: Record<string, unknown>;
  response: unknown;
  now: string;
  name: string;
  subagentId: string;
  parentToolUseId?: string;
  runtimeSessionId?: string;
  parentTurnId?: string;
  status: SubagentStatus;
  correlationId: string;
}

type SubagentRunEvent = Extract<ProjectedEvent, { kind: "subagent-run" }>;
type SubagentOutputEvent = Extract<ProjectedEvent, { kind: "subagent-output" }>;
type SubagentParentFields = Partial<
  Pick<
    SubagentRunPayload,
    "parent_runtime_session_id" | "parent_turn_id" | "parent_tool_use_id"
  >
>;

export function isFmarkMcpToolName(name: string): boolean {
  return name.startsWith("mcp__fmark__");
}

function isClaudeSubagentToolName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === "agent" || lower === "task";
}

export class SubagentHookProjector {
  constructor(
    private readonly toolHooks = new SubagentToolHookProjector(),
    private readonly finalMessages = new FinalSubagentMessageExtractor(),
  ) {}

  extract(input: {
    payload: HookPayload;
    participantId: string;
    runtimeId: string | null;
  }): ProjectedEvent[] {
    const payload = input.payload as Record<string, unknown>;
    const hookEventName = stringField(payload, "hook_event_name");
    if (hookEventName !== "SubagentStart" && hookEventName !== "SubagentStop") {
      return this.toolHooks.extract({ ...input, payload });
    }
    return this.extractLifecycleEvent(payload, hookEventName, input);
  }

  private extractLifecycleEvent(
    payload: Record<string, unknown>,
    hookEventName: "SubagentStart" | "SubagentStop",
    input: { participantId: string; runtimeId: string | null },
  ): ProjectedEvent[] {
    const now = new Date().toISOString();
    const run = this.lifecycleRun(payload, hookEventName, input, now);
    if (hookEventName === "SubagentStart") return [run];
    const finalMessage = this.finalMessages.extract(payload);
    return finalMessage === null
      ? [run]
      : [run, this.lifecycleOutput(payload, run, finalMessage, input)];
  }

  private lifecycleRun(
    payload: Record<string, unknown>,
    hookEventName: "SubagentStart" | "SubagentStop",
    input: { participantId: string; runtimeId: string | null },
    now: string,
  ): SubagentRunEvent {
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
    const prompt = pickStringField(payload, ["prompt", "task", "instructions"]);
    return {
      kind: "subagent-run",
      schema: "fmark.subagent-run.v1",
      parent_participant_id: input.participantId,
      parent_runtime_id: input.runtimeId,
      ...this.parentFields(payload),
      subagent_id: subagentId,
      name,
      role: pickStringField(payload, ["role", "agent_role"]),
      ...(prompt !== undefined
        ? { prompt_preview: truncateString(prompt, 4000) }
        : {}),
      status:
        hookEventName === "SubagentStart" ? "started" : subagentStopStatus(payload),
      started_at: hookEventName === "SubagentStart" ? now : undefined,
      ended_at: hookEventName === "SubagentStop" ? now : undefined,
      transcript_path: pickStringField(payload, [
        "agent_transcript_path",
        "transcript_path",
      ]),
      correlation_id:
        truncateString(
          pickStringField(payload, ["correlation_id", "tool_use_id", "turn_id"]) ??
            subagentId,
          180,
        ),
      sequence: 0,
      source: "hook",
      source_confidence: "high",
      raw: payload,
    };
  }

  private lifecycleOutput(
    payload: Record<string, unknown>,
    run: SubagentRunEvent,
    content: string,
    input: { participantId: string; runtimeId: string | null },
  ): SubagentOutputEvent {
    return {
      kind: "subagent-output",
      schema: "fmark.subagent-output.v1",
      parent_participant_id: input.participantId,
      parent_runtime_id: input.runtimeId,
      ...this.parentFields(payload),
      subagent_id: run.subagent_id,
      name: run.name,
      content,
      arbitrary: false,
      status: run.status,
      correlation_id: run.correlation_id,
      sequence: 1,
      source: "hook",
      source_confidence: "high",
      raw: payload,
    };
  }

  private parentFields(payload: Record<string, unknown>): SubagentParentFields {
    const runtimeSessionId = pickStringField(payload, ["session_id"]);
    const parentTurnId = pickStringField(payload, ["turn_id"]);
    const parentToolUseId = pickStringField(payload, ["tool_use_id"]);
    return {
      ...(runtimeSessionId !== undefined
        ? { parent_runtime_session_id: runtimeSessionId }
        : {}),
      ...(parentTurnId !== undefined ? { parent_turn_id: parentTurnId } : {}),
      ...(parentToolUseId !== undefined
        ? { parent_tool_use_id: parentToolUseId }
        : {}),
    };
  }
}

class SubagentToolHookProjector {
  constructor(
    private readonly responses = new SubagentResponseTextExtractor(),
  ) {}

  extract(input: SubagentInput): ProjectedEvent[] {
    const context = this.context(input);
    if (context === null) return [];
    const run = this.runEvent(context);
    const content = this.responses.text(context.response);
    return content === null ? [run] : [run, this.outputEvent(context, run, content)];
  }

  private context(input: SubagentInput): SubagentContext | null {
    const toolName = stringField(input.payload, "tool_name");
    if (!this.isClaudeAgentHook(input.payload, toolName)) return null;
    const now = new Date().toISOString();
    const toolInput = this.toolInput(input.payload);
    const response = this.response(input.payload);
    const parentToolUseId = this.parentToolUseId(input.payload);
    const runtimeSessionId = stringField(input.payload, "session_id");
    return {
      ...input,
      toolInput,
      response,
      now,
      name: this.name(toolInput),
      subagentId: this.subagentId(toolName!, toolInput),
      parentToolUseId,
      runtimeSessionId,
      parentTurnId: stringField(input.payload, "turn_id"),
      status: this.status(input.payload, response),
      correlationId: this.correlationId(input.runtimeId, toolName!, now, {
        parentToolUseId,
        runtimeSessionId,
      }),
    };
  }

  private isClaudeAgentHook(
    payload: Record<string, unknown>,
    toolName: string | undefined,
  ): boolean {
    const hookEventName = stringField(payload, "hook_event_name");
    return (
      toolName !== undefined &&
      (hookEventName === "PostToolUse" || hookEventName === "AfterTool") &&
      isClaudeSubagentToolName(toolName)
    );
  }

  private toolInput(payload: Record<string, unknown>): Record<string, unknown> {
    const rawInput =
      objectField(payload, "tool_input") ??
      objectField(payload, "input") ??
      objectField(payload, "parameters") ??
      {};
    const parameters = objectField(rawInput, "parameters");
    return parameters === null ? rawInput : { ...rawInput, ...parameters };
  }

  private response(payload: Record<string, unknown>): unknown {
    return payload.tool_response ?? payload.tool_result ?? payload.response ?? payload.result;
  }

  private name(toolInput: Record<string, unknown>): string {
    return truncateString(
      pickStringField(toolInput, [
        "subagent_type",
        "agent_type",
        "agent_name",
        "name",
        "description",
      ]) ?? "Claude sub-agent",
      160,
    );
  }

  private subagentId(
    toolName: string,
    toolInput: Record<string, unknown>,
  ): string {
    return truncateString(
      pickStringField(toolInput, ["agent_id", "subagent_id", "id", "agent_name"]) ??
        `${toolName}-${randomUUID()}`,
      160,
    );
  }

  private parentToolUseId(payload: Record<string, unknown>): string | undefined {
    return (
      stringField(payload, "tool_use_id") ??
      stringField(payload, "tool_call_id") ??
      stringField(payload, "original_request_name")
    );
  }

  private status(
    payload: Record<string, unknown>,
    response: unknown,
  ): SubagentStatus {
    const responseError =
      response !== null &&
      typeof response === "object" &&
      (response as Record<string, unknown>).error !== undefined;
    return payload.error !== undefined || responseError ? "failed" : "completed";
  }

  private correlationId(
    runtimeId: string | null,
    toolName: string,
    now: string,
    ids: { parentToolUseId?: string; runtimeSessionId?: string },
  ): string {
    return truncateString(
      ids.parentToolUseId ??
        `${ids.runtimeSessionId ?? runtimeId ?? "runtime"}:${toolName}:${now}`,
      180,
    );
  }

  private runEvent(context: SubagentContext): SubagentRunEvent {
    const prompt = pickStringField(context.toolInput, [
      "prompt",
      "task",
      "instructions",
    ]);
    return {
      kind: "subagent-run",
      schema: "fmark.subagent-run.v1",
      parent_participant_id: context.participantId,
      parent_runtime_id: context.runtimeId ?? "claude",
      ...this.parentFields(context),
      subagent_id: context.subagentId,
      name: context.name,
      role: pickStringField(context.toolInput, ["role", "agent_role"]),
      ...(prompt !== undefined
        ? { prompt_preview: truncateString(prompt, 4000) }
        : {}),
      status: context.status,
      started_at: context.now,
      ended_at: context.now,
      correlation_id: context.correlationId,
      sequence: 0,
      source: "hook",
      source_confidence: "high",
      raw: context.payload,
    };
  }

  private outputEvent(
    context: SubagentContext,
    run: SubagentRunEvent,
    content: string,
  ): SubagentOutputEvent {
    return {
      kind: "subagent-output",
      schema: "fmark.subagent-output.v1",
      parent_participant_id: context.participantId,
      parent_runtime_id: run.parent_runtime_id,
      ...this.parentFields(context),
      subagent_id: context.subagentId,
      name: context.name,
      content,
      arbitrary: false,
      status: context.status,
      correlation_id: context.correlationId,
      sequence: 1,
      source: "hook",
      source_confidence: "high",
      raw: context.payload,
    };
  }

  private parentFields(context: SubagentContext): SubagentParentFields {
    return {
      ...(context.runtimeSessionId !== undefined
        ? { parent_runtime_session_id: context.runtimeSessionId }
        : {}),
      ...(context.parentTurnId !== undefined
        ? { parent_turn_id: context.parentTurnId }
        : {}),
      ...(context.parentToolUseId !== undefined
        ? { parent_tool_use_id: context.parentToolUseId }
        : {}),
    };
  }
}

class SubagentResponseTextExtractor {
  text(response: unknown): string | null {
    if (typeof response === "string") return this.textFromString(response);
    if (Array.isArray(response)) return this.textFromArray(response);
    if (response === null || typeof response !== "object") return null;
    return this.textFromRecord(response as Record<string, unknown>, response);
  }

  private textFromString(value: string): string | null {
    const trimmed = value.trim();
    return trimmed.length > 0 ? this.clean(trimmed) : null;
  }

  private textFromArray(response: unknown[]): string | null {
    const joined = response
      .map((item) => this.textFromArrayItem(item))
      .filter((item): item is string => item !== undefined)
      .join("\n")
      .trim();
    return joined.length > 0 ? this.clean(joined) : null;
  }

  private textFromArrayItem(item: unknown): string | undefined {
    if (typeof item === "string") return this.clean(item);
    if (item === null || typeof item !== "object") return undefined;
    const record = item as Record<string, unknown>;
    return (
      stringField(record, "text") ??
      stringField(record, "content") ??
      stringField(record, "llmContent") ??
      stringField(record, "returnDisplay")
    );
  }

  private textFromRecord(
    record: Record<string, unknown>,
    original: unknown,
  ): string | null {
    const display = this.returnDisplayText(record);
    if (display !== null) return display;
    const direct = this.directText(record);
    if (direct !== undefined) return this.clean(direct);
    const collection = this.collectionText(record);
    if (collection !== null) return collection;
    if (record.result !== undefined) return this.text(record.result);
    return this.jsonFallback(original);
  }

  private returnDisplayText(record: Record<string, unknown>): string | null {
    return record.returnDisplay === undefined
      ? null
      : this.text(record.returnDisplay);
  }

  private directText(record: Record<string, unknown>): string | undefined {
    return (
      stringField(record, "last_assistant_message") ??
      stringField(record, "content") ??
      stringField(record, "result") ??
      stringField(record, "output") ??
      stringField(record, "llmContent") ??
      stringField(record, "returnDisplay") ??
      stringField(record, "message")
    );
  }

  private collectionText(record: Record<string, unknown>): string | null {
    return Array.isArray(record.content) || Array.isArray(record.llmContent)
      ? this.text(record.content ?? record.llmContent)
      : null;
  }

  private jsonFallback(value: unknown): string | null {
    try {
      const json = JSON.stringify(value);
      return json.length > 2 ? json : null;
    } catch {
      return null;
    }
  }

  private clean(value: string): string {
    return this.jsonResultText(value) ?? value;
  }

  private jsonResultText(value: string): string | null {
    const resultIndex = value.indexOf("Result:");
    const candidates =
      resultIndex >= 0
        ? [value.slice(resultIndex + "Result:".length).trim(), value.trim()]
        : [value.trim()];
    for (const candidate of candidates) {
      const extracted = this.extractJsonResultCandidate(candidate);
      if (extracted !== null) return extracted;
    }
    return null;
  }

  private extractJsonResultCandidate(candidate: string): string | null {
    if (!candidate.startsWith("{")) return null;
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed === null || typeof parsed !== "object") return null;
      return this.textFromParsedJson(parsed as Record<string, unknown>);
    } catch {
      return null;
    }
  }

  private textFromParsedJson(record: Record<string, unknown>): string | null {
    const direct =
      stringField(record, "response") ??
      stringField(record, "result") ??
      stringField(record, "output") ??
      stringField(record, "message");
    if (direct !== undefined) return direct;
    return record.result === undefined ? null : this.text(record.result);
  }
}

class FinalSubagentMessageExtractor {
  extract(payload: Record<string, unknown>): string | null {
    const direct = this.directMessage(payload);
    if (direct !== null) return direct;
    return this.resultMessage(payload.result);
  }

  private directMessage(payload: Record<string, unknown>): string | null {
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
    return null;
  }

  private resultMessage(result: unknown): string | null {
    if (Array.isArray(result)) return this.resultArrayMessage(result);
    if (result === null || typeof result !== "object") return null;
    const record = result as Record<string, unknown>;
    return (
      stringField(record, "last_assistant_message") ??
      stringField(record, "content") ??
      stringField(record, "output") ??
      stringField(record, "message") ??
      null
    );
  }

  private resultArrayMessage(result: unknown[]): string | null {
    const joined = result
      .map((item) => this.resultArrayItemText(item))
      .filter((item): item is string => item !== undefined)
      .join("\n")
      .trim();
    return joined.length > 0 ? joined : null;
  }

  private resultArrayItemText(item: unknown): string | undefined {
    if (typeof item === "string") return item;
    if (item === null || typeof item !== "object") return undefined;
    return stringField(item, "text") ?? stringField(item, "content");
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

export class PostToolUseProjector {
  constructor(
    private readonly success = new ToolUseSuccessClassifier(),
  ) {}

  extract(input: {
    payload: HookPayload;
    participantId: string;
    runtimeId: string | null;
  }): ProjectedEvent | null {
    const payload = input.payload as Record<string, unknown>;
    if (stringField(payload, "hook_event_name") !== "PostToolUse") return null;
    const toolName = stringField(payload, "tool_name");
    if (!this.shouldCaptureToolUse(toolName)) return null;
    const toolUseId =
      stringField(payload, "tool_use_id") ??
      stringField(payload, "tool_call_id");
    if (toolUseId === undefined) return null;
    return {
      kind: "tool-use",
      tool_name: toolName!,
      tool_use_id: toolUseId,
      input: objectField(payload, "tool_input") ?? objectField(payload, "input") ?? {},
      result: this.result(payload),
      success: this.success.isSuccessful(payload),
    };
  }

  private shouldCaptureToolUse(toolName: string | undefined): boolean {
    return (
      toolName !== undefined &&
      !isClaudeSubagentToolName(toolName) &&
      !isFmarkMcpToolName(toolName)
    );
  }

  private result(payload: Record<string, unknown>): unknown {
    return payload.tool_response ?? payload.tool_result ?? payload.response ?? payload.result ?? null;
  }
}

class ToolUseSuccessClassifier {
  isSuccessful(payload: Record<string, unknown>): boolean {
    if (this.payloadHasFailure(payload)) return false;
    const response = this.responseRecord(payload);
    return response === null || !this.recordHasFailure(response);
  }

  private payloadHasFailure(payload: Record<string, unknown>): boolean {
    return (
      nonEmptyError(payload.error) ||
      payload.is_error === true ||
      payload.isError === true
    );
  }

  private responseRecord(
    payload: Record<string, unknown>,
  ): Record<string, unknown> | null {
    const response =
      payload.tool_response ?? payload.tool_result ?? payload.response ?? payload.result;
    return response !== null && typeof response === "object" && !Array.isArray(response)
      ? (response as Record<string, unknown>)
      : null;
  }

  private recordHasFailure(record: Record<string, unknown>): boolean {
    return (
      nonEmptyError(record.error) ||
      record.is_error === true ||
      record.isError === true ||
      looksFailedStatus(record.status) ||
      looksFailedStatus(record.outcome)
    );
  }
}

function nonEmptyError(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function looksFailedStatus(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const lower = value.toLowerCase();
  return (
    lower === "failed" ||
    lower === "error" ||
    lower === "cancelled" ||
    lower === "canceled"
  );
}
