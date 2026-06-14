export type TurnBlock =
  | { type: "text"; text: string }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: unknown;
      result?: unknown;
      is_error?: boolean;
    };

interface RawEntry {
  role: "user" | "assistant" | string;
  content: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: unknown }
    | { type: "tool_result"; tool_use_id: string; content: unknown; is_error?: boolean }
    | { type: string; [k: string]: unknown }
  >;
}

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

function parseJsonl(raw: string): RawEntry[] {
  return raw
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as RawEntry);
}

function parseJsonlUnknown(raw: string): unknown[] {
  return raw
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as unknown);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function parseMaybeJsonObject(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string" || value.trim().length === 0) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return asRecord(parsed) ?? {};
  } catch {
    return {};
  }
}

function payloadOf(entry: unknown): Record<string, unknown> | null {
  const record = asRecord(entry);
  return asRecord(record?.payload);
}

function isCodexJsonl(entries: unknown[]): boolean {
  return entries.some((entry) => {
    const record = asRecord(entry);
    if (record === null) return false;
    if (record.type === "response_item" || record.type === "event_msg") return true;
    if (
      (record.type === "item.started" || record.type === "item.completed") &&
      asRecord(record.item)?.type === "collab_tool_call"
    ) {
      return true;
    }
    const payload = asRecord(record.payload);
    return payload?.type === "function_call" || payload?.type === "agent_message";
  });
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
  const parts = content
    .map((item) => {
      const record = asRecord(item);
      return (
        stringValue(record?.text) ??
        stringValue(record?.content) ??
        stringValue(record?.output_text)
      );
    })
    .filter((part): part is string => part !== undefined);
  const joined = parts.join("\n").trim();
  return joined.length > 0 ? joined : null;
}

function codexWaitStatusText(value: unknown): {
  status: string;
  content: string | null;
  error: string | null;
} {
  if (typeof value === "string") {
    return { status: "completed", content: value, error: null };
  }
  const record = asRecord(value);
  if (record === null) {
    return { status: "unknown", content: null, error: null };
  }
  const directStatus = stringValue(record.status);
  const directMessage = stringValue(record.message);
  if (directStatus === "completed") {
    return { status: "completed", content: directMessage ?? null, error: null };
  }
  if (directStatus === "failed" || directStatus === "error") {
    return {
      status: "failed",
      content: directMessage ?? null,
      error: directMessage ?? null,
    };
  }
  if (directStatus === "cancelled" || directStatus === "canceled") {
    return { status: "cancelled", content: directMessage ?? null, error: null };
  }
  const completed = stringValue(record.completed);
  if (completed !== undefined) {
    return { status: "completed", content: completed, error: null };
  }
  const failed = stringValue(record.failed) ?? stringValue(record.error);
  if (failed !== undefined) {
    return { status: "failed", content: failed, error: failed };
  }
  const cancelled = stringValue(record.cancelled) ?? stringValue(record.canceled);
  if (cancelled !== undefined) {
    return { status: "cancelled", content: cancelled, error: null };
  }
  try {
    const json = JSON.stringify(value);
    return { status: "unknown", content: json.length > 2 ? json : null, error: null };
  } catch {
    return { status: "unknown", content: null, error: null };
  }
}

function extractCodexLastAssistantTurn(entries: unknown[]): TurnBlock[] {
  const slice = lastCodexTaskSlice(entries);
  const calls = new Map<string, CodexFunctionCall>();
  const spawnByAgentId = new Map<string, {
    call: CodexFunctionCall;
    output: Record<string, unknown>;
  }>();
  const out: TurnBlock[] = [];
  const agentMessageFallbacks: string[] = [];
  let sawAssistantMessage = false;

  for (const entry of slice) {
    const outer = asRecord(entry) as CodexJsonlEntry | null;
    const item = asRecord(outer?.item);
    if (
      item !== null &&
      (outer?.type === "item.started" || outer?.type === "item.completed")
    ) {
      if (item.type === "collab_tool_call") {
        const itemId = stringValue(item.id);
        const toolName = stringValue(item.tool);
        if (
          outer.type === "item.completed" &&
          itemId !== undefined &&
          toolName === "spawn_agent"
        ) {
          const receiverThreadIds = Array.isArray(item.receiver_thread_ids)
            ? item.receiver_thread_ids.filter(
                (value): value is string => typeof value === "string",
              )
            : [];
          for (const agentId of receiverThreadIds) {
            spawnByAgentId.set(agentId, {
              call: {
                id: itemId,
                name: "spawn_agent",
                namespace: "multi_agent_v1",
                arguments: {
                  ...(stringValue(item.prompt) !== undefined
                    ? { message: stringValue(item.prompt)! }
                    : {}),
                },
              },
              output: { agent_id: agentId },
            });
          }
          continue;
        }
        if (
          outer.type === "item.completed" &&
          itemId !== undefined &&
          toolName === "wait"
        ) {
          const agentsStates = asRecord(item.agents_states);
          if (agentsStates === null) continue;
          for (const [agentId, agentStatus] of Object.entries(agentsStates)) {
            const spawn = spawnByAgentId.get(agentId);
            const final = codexWaitStatusText(agentStatus);
            out.push({
              type: "tool_use",
              id: `${itemId}:${agentId}`,
              name: "codex_subagent",
              input: {
                ...(spawn?.call.arguments ?? {}),
                agent_id: agentId,
                status: final.status,
              },
              result: final.content ?? final.error ?? agentStatus,
              is_error: final.status === "failed",
            });
          }
          continue;
        }
      }
      if (item.type === "agent_message") {
        const text = stringValue(item.text);
        if (text !== undefined) agentMessageFallbacks.push(text);
        continue;
      }
    }

    const payload = asRecord(outer?.payload);
    if (payload === null) continue;

    if (payload.type === "function_call") {
      const callId = stringValue(payload.call_id) ?? stringValue(payload.id);
      const name = stringValue(payload.name);
      if (callId === undefined || name === undefined) continue;
      calls.set(callId, {
        id: callId,
        name,
        namespace: stringValue(payload.namespace),
        arguments: parseMaybeJsonObject(payload.arguments),
      });
      continue;
    }

    if (payload.type === "function_call_output") {
      const callId = stringValue(payload.call_id);
      if (callId === undefined) continue;
      const call = calls.get(callId);
      if (call === undefined || call.namespace !== "multi_agent_v1") continue;
      const output = parseMaybeJsonObject(payload.output);

      if (call.name === "spawn_agent") {
        const agentId = stringValue(output.agent_id);
        if (agentId !== undefined) {
          spawnByAgentId.set(agentId, { call, output });
        }
        continue;
      }

      if (call.name !== "wait_agent") continue;
      const status = asRecord(output.status);
      if (status === null) continue;
      for (const [agentId, agentStatus] of Object.entries(status)) {
        const spawn = spawnByAgentId.get(agentId);
        const final = codexWaitStatusText(agentStatus);
        const nickname =
          stringValue(spawn?.output.nickname) ??
          stringValue(spawn?.call.arguments.agent_name) ??
          stringValue(spawn?.call.arguments.name);
        out.push({
          type: "tool_use",
          id: `${call.id}:${agentId}`,
          name: "codex_subagent",
          input: {
            ...(spawn?.call.arguments ?? {}),
            agent_id: agentId,
            ...(nickname !== undefined ? { agent_name: nickname } : {}),
            wait_arguments: call.arguments,
            status: final.status,
          },
          result: final.content ?? final.error ?? agentStatus,
          is_error: final.status === "failed",
        });
      }
      continue;
    }

    if (payload.type === "message" && payload.role === "assistant") {
      const text = codexMessageText(payload);
      if (text !== null) {
        sawAssistantMessage = true;
        out.push({ type: "text", text });
      }
      continue;
    }

    if (payload.type === "agent_message") {
      const text = codexMessageText(payload);
      if (text !== null) agentMessageFallbacks.push(text);
    }
  }

  if (!sawAssistantMessage) {
    for (const text of agentMessageFallbacks) out.push({ type: "text", text });
  }

  return out;
}

function isToolResultOnly(entry: RawEntry): boolean {
  return (
    entry.role === "user" &&
    entry.content.length > 0 &&
    entry.content.every((b) => b.type === "tool_result")
  );
}

export function extractLastAssistantTurn(raw: string): TurnBlock[] {
  const unknownEntries = parseJsonlUnknown(raw);
  if (isCodexJsonl(unknownEntries)) {
    return extractCodexLastAssistantTurn(unknownEntries);
  }

  const entries = unknownEntries as RawEntry[];

  // Find the last assistant entry.
  let end = entries.length - 1;
  while (end >= 0 && entries[end]?.role !== "assistant") end--;
  if (end < 0) return [];

  // Walk back to gather contiguous assistant entries + interleaved tool_result user messages.
  let start = end;
  while (start - 1 >= 0) {
    const prev = entries[start - 1];
    if (!prev) break;
    if (prev.role === "assistant") {
      start -= 1;
    } else if (isToolResultOnly(prev)) {
      start -= 1;
    } else {
      break;
    }
  }

  // Build a tool_use_id → result map from any tool_result messages in the slice.
  const resultById = new Map<string, { content: unknown; is_error: boolean }>();
  for (let i = start; i <= end; i++) {
    const e = entries[i];
    if (!e || e.role !== "user") continue;
    for (const block of e.content) {
      if (block.type === "tool_result") {
        const tr = block as {
          type: "tool_result";
          tool_use_id: string;
          content: unknown;
          is_error?: boolean;
        };
        resultById.set(tr.tool_use_id, {
          content: tr.content,
          is_error: tr.is_error === true,
        });
      }
    }
  }

  // Flatten assistant content blocks only, in order.
  const out: TurnBlock[] = [];
  for (let i = start; i <= end; i++) {
    const e = entries[i];
    if (!e || e.role !== "assistant") continue;
    for (const block of e.content) {
      if (block.type === "text") {
        const tb = block as { type: "text"; text: string };
        out.push({ type: "text", text: tb.text });
      } else if (block.type === "tool_use") {
        const tu = block as {
          type: "tool_use";
          id: string;
          name: string;
          input: unknown;
        };
        const r = resultById.get(tu.id);
        out.push({
          type: "tool_use",
          id: tu.id,
          name: tu.name,
          input: tu.input,
          result: r?.content,
          is_error: r?.is_error ?? false,
        });
      }
      // Drop thinking blocks — they're encrypted in Claude transcripts and
      // are not surfaced in F-Mark by design. Other block types (citations,
      // server-side-tool-use, etc.) are also ignored here; add an explicit
      // branch above if any of them should be projected.
    }
  }
  return out;
}
