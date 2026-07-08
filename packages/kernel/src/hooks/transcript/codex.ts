import type { TurnBlock } from "./types.js";

interface CodexJsonlEntry {
  type?: string;
  payload?: Record<string, unknown>;
  item?: Record<string, unknown>;
}

interface CodexFunctionCall {
  id: string;
  name: string;
  namespace?: string;
  arguments: Record<string, unknown>;
}

interface CodexSpawn {
  call: CodexFunctionCall;
  output: Record<string, unknown>;
}

interface WaitStatusText {
  status: string;
  content: string | null;
  error: string | null;
}

type NormalizedWaitStatus = "completed" | "failed" | "cancelled";
type ItemEvent = {
  type: "item.started" | "item.completed";
  item: Record<string, unknown>;
};
type CompletedCollabCall = { id: string; toolName: string };

const CODEX_ENVELOPE_TYPES = new Set(["response_item", "event_msg"]);
const CODEX_PAYLOAD_TYPES = new Set(["function_call", "agent_message"]);
const DIRECT_WAIT_STATUSES = new Map<string, NormalizedWaitStatus>([
  ["completed", "completed"],
  ["failed", "failed"],
  ["error", "failed"],
  ["cancelled", "cancelled"],
  ["canceled", "cancelled"],
]);
const KEYED_WAIT_STATUS_FIELDS: Array<{
  field: string;
  status: NormalizedWaitStatus;
}> = [
  { field: "completed", status: "completed" },
  { field: "failed", status: "failed" },
  { field: "error", status: "failed" },
  { field: "cancelled", status: "cancelled" },
  { field: "canceled", status: "cancelled" },
];
const MESSAGE_TEXT_FIELDS = ["text", "content", "output_text"] as const;

export function isCodexJsonl(entries: unknown[]): boolean {
  return entries.some(isCodexJsonlEntry);
}

export function extractCodexLastAssistantTurn(entries: unknown[]): TurnBlock[] {
  return new CodexLastAssistantTurnExtractor(lastCodexTaskSlice(entries)).extract();
}

/** Text of the user message that opened the transcript's last task slice,
    or `null` when the slice has none. Prefers `response_item` messages with
    role "user"; falls back to `event_msg` user_message payloads. */
export function extractCodexLastTurnUserText(entries: unknown[]): string | null {
  for (const entry of lastCodexTaskSlice(entries)) {
    const payload = payloadOf(entry);
    if (payload === null) continue;
    if (payload.type === "message" && payload.role === "user") {
      const text = codexMessageText(payload);
      if (text !== null) return text;
    }
    if (payload.type === "user_message") {
      const text = stringValue(payload.message);
      if (text !== undefined) return text;
    }
  }
  return null;
}

class CodexLastAssistantTurnExtractor {
  private readonly calls = new Map<string, CodexFunctionCall>();
  private readonly spawnByAgentId = new Map<string, CodexSpawn>();
  private readonly blocks: TurnBlock[] = [];
  private readonly agentMessageFallbacks: string[] = [];
  private readonly payloadVisitors = new Map<
    string,
    (payload: Record<string, unknown>) => void
  >([
    ["function_call", (payload) => this.recordFunctionCall(payload)],
    ["function_call_output", (payload) => this.projectFunctionCallOutput(payload)],
    ["message", (payload) => this.recordAssistantMessage(payload)],
    ["agent_message", (payload) => this.recordAgentMessagePayload(payload)],
  ]);
  private sawAssistantMessage = false;

  constructor(private readonly entries: unknown[]) {}

  extract(): TurnBlock[] {
    for (const entry of this.entries) {
      this.visitEntry(entry);
    }
    this.flushFallbackMessages();
    return this.blocks;
  }

  private visitEntry(entry: unknown): void {
    const outer = asRecord(entry) as CodexJsonlEntry | null;
    if (this.visitItemEvent(outer)) return;
    this.visitPayload(asRecord(outer?.payload));
  }

  private visitItemEvent(outer: CodexJsonlEntry | null): boolean {
    const event = itemEvent(outer);
    if (event === null) return false;

    if (event.item.type === "collab_tool_call") {
      return this.visitCollabToolCall(event.type, event.item);
    }

    return this.visitAgentMessageItem(event.item);
  }

  private visitCollabToolCall(
    eventType: "item.started" | "item.completed",
    item: Record<string, unknown>,
  ): boolean {
    const call = completedCollabCall(eventType, item);
    if (call === null) return false;

    if (call.toolName === "spawn_agent") {
      this.recordCollabSpawn(call.id, item);
      return true;
    }

    return this.visitCollabWaitTool(call, item);
  }

  private visitAgentMessageItem(item: Record<string, unknown>): boolean {
    if (item.type !== "agent_message") return false;
    this.recordAgentMessageText(item.text);
    return true;
  }

  private visitCollabWaitTool(
    call: CompletedCollabCall,
    item: Record<string, unknown>,
  ): boolean {
    if (call.toolName !== "wait") return false;
    this.projectCollabWait(call.id, item);
    return true;
  }

  private recordCollabSpawn(
    itemId: string,
    item: Record<string, unknown>,
  ): void {
    const prompt = stringValue(item.prompt);
    const call: CodexFunctionCall = {
      id: itemId,
      name: "spawn_agent",
      namespace: "multi_agent_v1",
      arguments: prompt === undefined ? {} : { message: prompt },
    };

    for (const agentId of stringArray(item.receiver_thread_ids)) {
      this.spawnByAgentId.set(agentId, {
        call,
        output: { agent_id: agentId },
      });
    }
  }

  private projectCollabWait(itemId: string, item: Record<string, unknown>): void {
    const agentsStates = asRecord(item.agents_states);
    if (agentsStates === null) return;

    for (const [agentId, agentStatus] of Object.entries(agentsStates)) {
      this.blocks.push(this.collabWaitBlock(itemId, agentId, agentStatus));
    }
  }

  private collabWaitBlock(
    itemId: string,
    agentId: string,
    agentStatus: unknown,
  ): TurnBlock {
    const spawn = this.spawnByAgentId.get(agentId);
    const final = codexWaitStatusText(agentStatus);
    return {
      type: "tool_use",
      id: `${itemId}:${agentId}`,
      name: "codex_subagent",
      input: collabWaitInput(spawn, agentId, final.status),
      result: waitResult(final, agentStatus),
      is_error: final.status === "failed",
    };
  }

  private visitPayload(payload: Record<string, unknown> | null): void {
    if (payload === null) return;

    const payloadType = stringValue(payload.type);
    if (payloadType === undefined) return;
    this.payloadVisitors.get(payloadType)?.(payload);
  }

  private recordFunctionCall(payload: Record<string, unknown>): void {
    const callId = stringValue(payload.call_id) ?? stringValue(payload.id);
    const name = stringValue(payload.name);
    if (callId === undefined || name === undefined) return;

    this.calls.set(callId, {
      id: callId,
      name,
      namespace: stringValue(payload.namespace),
      arguments: parseMaybeJsonObject(payload.arguments),
    });
  }

  private projectFunctionCallOutput(payload: Record<string, unknown>): void {
    const projected = this.projectedFunctionOutput(payload);
    if (projected === null) return;

    if (projected.call.name === "spawn_agent") {
      this.recordFunctionSpawn(projected.call, projected.output);
      return;
    }

    this.projectWaitAgentOutput(projected.call, projected.output);
  }

  private projectedFunctionOutput(
    payload: Record<string, unknown>,
  ): { call: CodexFunctionCall; output: Record<string, unknown> } | null {
    const callId = stringValue(payload.call_id);
    if (callId === undefined) return null;

    const call = this.calls.get(callId);
    if (!isMultiAgentCall(call)) return null;

    return { call, output: parseMaybeJsonObject(payload.output) };
  }

  private recordFunctionSpawn(
    call: CodexFunctionCall,
    output: Record<string, unknown>,
  ): void {
    const agentId = stringValue(output.agent_id);
    if (agentId !== undefined) {
      this.spawnByAgentId.set(agentId, { call, output });
    }
  }

  private projectWaitAgent(
    call: CodexFunctionCall,
    output: Record<string, unknown>,
  ): void {
    const status = asRecord(output.status);
    if (status === null) return;

    for (const [agentId, agentStatus] of Object.entries(status)) {
      this.blocks.push(this.waitAgentBlock(call, agentId, agentStatus));
    }
  }

  private projectWaitAgentOutput(
    call: CodexFunctionCall,
    output: Record<string, unknown>,
  ): void {
    if (call.name !== "wait_agent") return;
    this.projectWaitAgent(call, output);
  }

  private waitAgentBlock(
    call: CodexFunctionCall,
    agentId: string,
    agentStatus: unknown,
  ): TurnBlock {
    const spawn = this.spawnByAgentId.get(agentId);
    const final = codexWaitStatusText(agentStatus);

    return {
      type: "tool_use",
      id: `${call.id}:${agentId}`,
      name: "codex_subagent",
      input: waitAgentInput(call, spawn, agentId, final.status),
      result: waitResult(final, agentStatus),
      is_error: final.status === "failed",
    };
  }

  private recordAssistantMessage(payload: Record<string, unknown>): void {
    if (payload.role !== "assistant") return;

    const text = codexMessageText(payload);
    if (text === null) return;

    this.sawAssistantMessage = true;
    this.blocks.push({ type: "text", text });
  }

  private recordAgentMessagePayload(payload: Record<string, unknown>): void {
    const text = codexMessageText(payload);
    if (text !== null) this.agentMessageFallbacks.push(text);
  }

  private recordAgentMessageText(value: unknown): void {
    const text = stringValue(value);
    if (text !== undefined) this.agentMessageFallbacks.push(text);
  }

  private flushFallbackMessages(): void {
    if (this.sawAssistantMessage) return;

    for (const text of this.agentMessageFallbacks) {
      this.blocks.push({ type: "text", text });
    }
  }
}

function isCodexJsonlEntry(entry: unknown): boolean {
  const record = asRecord(entry);
  if (record === null) return false;
  if (isCodexEnvelope(record)) return true;
  if (hasCollabToolItem(record)) return true;
  return hasCodexPayload(record);
}

function isCodexEnvelope(record: Record<string, unknown>): boolean {
  return CODEX_ENVELOPE_TYPES.has(String(record.type));
}

function hasCodexPayload(record: Record<string, unknown>): boolean {
  const payload = asRecord(record.payload);
  return payload !== null && CODEX_PAYLOAD_TYPES.has(String(payload.type));
}

function hasCollabToolItem(record: Record<string, unknown>): boolean {
  return (
    isItemEventType(record.type) &&
    asRecord(record.item)?.type === "collab_tool_call"
  );
}

function lastCodexTaskSlice(entries: unknown[]): unknown[] {
  let start = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    const payload = payloadOf(entries[i]);
    if (payload?.type === "task_started") {
      start = i;
      break;
    }
  }
  return entries.slice(start);
}

function codexMessageText(payload: Record<string, unknown>): string | null {
  const direct = stringValue(payload.message);
  if (direct !== undefined) return direct;

  const content = payload.content;
  if (!Array.isArray(content)) return null;

  const parts = contentTextParts(content);
  const joined = parts.join("\n").trim();
  return joined.length > 0 ? joined : null;
}

function codexWaitStatusText(value: unknown): WaitStatusText {
  const stringStatus = waitStatusFromString(value);
  if (stringStatus !== null) return stringStatus;

  const recordStatus = waitStatusFromRecord(value);
  if (recordStatus !== null) return recordStatus;

  return unknownWaitStatusText(value);
}

function waitStatusFromString(value: unknown): WaitStatusText | null {
  if (typeof value === "string") {
    return { status: "completed", content: value, error: null };
  }
  return null;
}

function waitStatusFromRecord(value: unknown): WaitStatusText | null {
  const record = asRecord(value);
  if (record === null) return null;

  const directStatus = stringValue(record.status);
  const directMessage = stringValue(record.message);
  const direct = directWaitStatusText(directStatus, directMessage);
  if (direct !== null) return direct;

  return keyedWaitStatusText(record);
}

function directWaitStatusText(
  status: string | undefined,
  message: string | undefined,
): WaitStatusText | null {
  if (status === undefined) return null;
  const normalized = DIRECT_WAIT_STATUSES.get(status);
  if (normalized === undefined) return null;
  return waitStatusText(normalized, message ?? null);
}

function keyedWaitStatusText(record: Record<string, unknown>): WaitStatusText | null {
  for (const { field, status } of KEYED_WAIT_STATUS_FIELDS) {
    const value = stringValue(record[field]);
    if (value !== undefined) return waitStatusText(status, value);
  }
  return null;
}

function waitStatusText(
  status: NormalizedWaitStatus,
  content: string | null,
): WaitStatusText {
  return { status, content, error: waitStatusError(status, content) };
}

function waitStatusError(
  status: NormalizedWaitStatus,
  content: string | null,
): string | null {
  if (status !== "failed") return null;
  return content;
}

function unknownWaitStatusText(value: unknown): WaitStatusText {
  try {
    const json = JSON.stringify(value);
    return { status: "unknown", content: json.length > 2 ? json : null, error: null };
  } catch {
    return { status: "unknown", content: null, error: null };
  }
}

function parseMaybeJsonObject(value: unknown): Record<string, unknown> {
  const record = plainRecord(value);
  if (record !== null) return record;

  const json = stringValue(value);
  if (json === undefined) return {};

  return parseJsonObject(json);
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return asRecord(parsed) ?? {};
  } catch {
    return {};
  }
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value);
  if (record === null) return null;
  if (Array.isArray(value)) return null;
  return record;
}

function payloadOf(entry: unknown): Record<string, unknown> | null {
  const record = asRecord(entry);
  return asRecord(record?.payload);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null) return null;
  if (typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function stringValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function isItemEventType(value: unknown): value is "item.started" | "item.completed" {
  return value === "item.started" || value === "item.completed";
}

function itemEvent(outer: CodexJsonlEntry | null): ItemEvent | null {
  const type = itemEventType(outer);
  if (type === null) return null;

  const item = itemEventItem(outer);
  if (item === null) return null;

  return { type, item };
}

function itemEventType(
  outer: CodexJsonlEntry | null,
): "item.started" | "item.completed" | null {
  if (outer === null) return null;
  if (!isItemEventType(outer.type)) return null;
  return outer.type;
}

function itemEventItem(
  outer: CodexJsonlEntry | null,
): Record<string, unknown> | null {
  if (outer === null) return null;
  return asRecord(outer.item);
}

function completedCollabCall(
  eventType: "item.started" | "item.completed",
  item: Record<string, unknown>,
): CompletedCollabCall | null {
  if (eventType !== "item.completed") return null;

  const id = stringValue(item.id);
  const toolName = stringValue(item.tool);
  if (id === undefined || toolName === undefined) return null;

  return { id, toolName };
}

function isMultiAgentCall(
  call: CodexFunctionCall | undefined,
): call is CodexFunctionCall {
  return call !== undefined && call.namespace === "multi_agent_v1";
}

function collabWaitInput(
  spawn: CodexSpawn | undefined,
  agentId: string,
  status: string,
): Record<string, unknown> {
  return {
    ...spawnArguments(spawn),
    agent_id: agentId,
    status,
  };
}

function waitAgentInput(
  call: CodexFunctionCall,
  spawn: CodexSpawn | undefined,
  agentId: string,
  status: string,
): Record<string, unknown> {
  const input: Record<string, unknown> = {
    ...spawnArguments(spawn),
    agent_id: agentId,
    wait_arguments: call.arguments,
    status,
  };
  const nickname = spawnNickname(spawn);
  if (nickname !== undefined) input.agent_name = nickname;
  return input;
}

function spawnArguments(spawn: CodexSpawn | undefined): Record<string, unknown> {
  if (spawn === undefined) return {};
  return spawn.call.arguments;
}

function spawnNickname(spawn: CodexSpawn | undefined): string | undefined {
  if (spawn === undefined) return undefined;
  return (
    stringValue(spawn.output.nickname) ??
    stringValue(spawn.call.arguments.agent_name) ??
    stringValue(spawn.call.arguments.name)
  );
}

function waitResult(status: WaitStatusText, fallback: unknown): unknown {
  if (status.content !== null) return status.content;
  if (status.error !== null) return status.error;
  return fallback;
}

function contentTextParts(content: unknown[]): string[] {
  const parts: string[] = [];
  for (const item of content) {
    const text = contentItemText(item);
    if (text !== undefined) parts.push(text);
  }
  return parts;
}

function contentItemText(item: unknown): string | undefined {
  const record = asRecord(item);
  if (record === null) return undefined;
  return firstString(record, MESSAGE_TEXT_FIELDS);
}

function firstString(
  record: Record<string, unknown>,
  fields: readonly string[],
): string | undefined {
  for (const field of fields) {
    const value = stringValue(record[field]);
    if (value !== undefined) return value;
  }
  return undefined;
}
