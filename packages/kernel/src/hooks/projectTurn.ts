import type { TurnBlock } from "./transcript.js";
import type {
  SubagentOutputPayload,
  SubagentRunPayload,
  SubagentSourceConfidence,
  SubagentStatus,
} from "@f-mark/shared";

export type ProjectedEvent =
  | {
      kind: "prose";
      content: string;
      arbitrary: boolean;
      /** Set by the Stop coalescer: delta files this block replaces. */
      supersedes?: string | string[];
      /** Stamp the coalesced event at the run's first delta time so it keeps
       *  its place ahead of any following tool-use in visible reads. */
      timestamp?: string;
    }
  | {
      kind: "tool-use";
      tool_name: string;
      tool_use_id: string;
      input: unknown;
      result: unknown;
      success: boolean;
    }
  | ({ kind: "subagent-run" } & SubagentRunPayload)
  | ({ kind: "subagent-output" } & SubagentOutputPayload);

export interface ProjectTurnOptions {
  parentParticipantId?: string;
  parentRuntimeId?: string | null;
  parentRuntimeSessionId?: string;
  parentTurnId?: string;
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

function pickString(
  record: Record<string, unknown> | null,
  keys: string[],
): string | undefined {
  if (record === null) return undefined;
  for (const key of keys) {
    const value = stringValue(record[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function nestedInput(input: unknown): Record<string, unknown> | null {
  const root = asRecord(input);
  if (root === null) return null;
  const parameters = asRecord(root.parameters);
  if (parameters !== null) return { ...root, ...parameters };
  return root;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}

function jsonResultText(value: string): string | null {
  const candidates = [value.trim()];
  const resultIndex = value.indexOf("Result:");
  if (resultIndex >= 0) candidates.unshift(value.slice(resultIndex + "Result:".length).trim());
  for (const candidate of candidates) {
    if (!candidate.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(candidate) as unknown;
      const record = asRecord(parsed);
      if (record === null) continue;
      const direct = pickString(record, [
        "response",
        "result",
        "output",
        "message",
      ]);
      if (direct !== undefined) return direct;
      if (record.result !== undefined) {
        const nested = resultText(record.result);
        if (nested !== null) return nested;
      }
    } catch {
      // Keep trying less-specific candidates.
    }
  }
  return null;
}

function cleanResultText(value: string): string {
  return jsonResultText(value) ?? value;
}

function resultText(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? cleanResultText(trimmed) : null;
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => {
        if (typeof item === "string") return cleanResultText(item);
        const record = asRecord(item);
        return pickString(record, ["text", "content", "result", "output"]);
      })
      .filter((part): part is string => part !== undefined);
    const joined = parts.join("\n").trim();
    return joined.length > 0 ? cleanResultText(joined) : null;
  }
  const record = asRecord(value);
  if (record !== null) {
    if (record.returnDisplay !== undefined) {
      const display = resultText(record.returnDisplay);
      if (display !== null) return display;
    }
    const direct = pickString(record, [
      "last_assistant_message",
      "content",
      "result",
      "output",
      "final",
      "final_response",
      "message",
    ]);
    if (direct !== undefined) return cleanResultText(direct);
    if (Array.isArray(record.content) || Array.isArray(record.llmContent)) {
      return resultText(record.content ?? record.llmContent);
    }
    if (record.result !== undefined) return resultText(record.result);
    try {
      const json = JSON.stringify(value);
      return json.length > 2 ? json : null;
    } catch {
      return null;
    }
  }
  return null;
}

interface SubagentProjection {
  run: { kind: "subagent-run" } & SubagentRunPayload;
  output?: { kind: "subagent-output" } & SubagentOutputPayload;
}

function classifySubagentTool(block: Extract<TurnBlock, { type: "tool_use" }>): {
  provider: "claude" | "codex" | null;
  confidence: SubagentSourceConfidence;
} {
  const name = block.name.toLowerCase();
  if (name === "agent" || name === "task") {
    return { provider: "claude", confidence: "medium" };
  }
  if (name === "codex_subagent") {
    return { provider: "codex", confidence: "medium" };
  }
  return { provider: null, confidence: "low" };
}

function projectSubagentTool(
  block: Extract<TurnBlock, { type: "tool_use" }>,
  options: ProjectTurnOptions,
  sequence: number,
): SubagentProjection | null {
  const classified = classifySubagentTool(block);
  if (classified.provider === null) return null;
  const input = nestedInput(block.input);
  const name =
    pickString(input, [
      "subagent_type",
      "agent_type",
      "agent_name",
      "agent",
      "name",
      "description",
    ]) ??
    (classified.provider === "codex" ? "Codex sub-agent" : "Claude sub-agent");
  const subagentId =
    pickString(input, ["agent_id", "subagent_id", "id"]) ?? block.id;
  const promptPreview = pickString(input, [
    "prompt",
    "task",
    "instructions",
    "description",
    "query",
  ]);
  const now = new Date().toISOString();
  const inputStatus = pickString(input, ["status"]);
  const status: SubagentStatus =
    block.is_error === true
      ? "failed"
      : inputStatus === "cancelled" || inputStatus === "canceled"
        ? "cancelled"
        : inputStatus === "failed" || inputStatus === "error"
          ? "failed"
          : inputStatus === "started" || inputStatus === "running"
            ? inputStatus
            : "completed";
  const correlationId =
    pickString(input, ["correlation_id", "tool_use_id"]) ??
    `${block.name}:${block.id}`;
  const parentParticipantId = options.parentParticipantId ?? "unknown";
  const base = {
    parent_participant_id: parentParticipantId,
    parent_runtime_id: options.parentRuntimeId ?? classified.provider,
    ...(options.parentRuntimeSessionId !== undefined
      ? { parent_runtime_session_id: options.parentRuntimeSessionId }
      : {}),
    ...(options.parentTurnId !== undefined ? { parent_turn_id: options.parentTurnId } : {}),
    parent_tool_use_id: block.id,
    subagent_id: truncate(subagentId, 160),
    correlation_id: truncate(correlationId, 180),
    source: "transcript" as const,
    source_confidence: classified.confidence,
  };
  const run: SubagentProjection["run"] = {
    kind: "subagent-run",
    schema: "fmark.subagent-run.v1",
    ...base,
    name: truncate(name, 160),
    role: pickString(input, ["role", "agent_role"]),
    ...(promptPreview !== undefined
      ? { prompt_preview: truncate(promptPreview, 4000) }
      : {}),
    status,
    started_at: now,
    ended_at: now,
    transcript_path: pickString(input, ["agent_transcript_path", "transcript_path"]),
    sequence,
    raw: { tool_name: block.name, input: block.input },
  };
  const text = resultText(block.result);
  if (text === null) return { run };
  return {
    run,
    output: {
      kind: "subagent-output",
      schema: "fmark.subagent-output.v1",
      ...base,
      name: truncate(name, 160),
      content: text,
      arbitrary: false,
      status,
      sequence: sequence + 1,
      raw: { tool_name: block.name, result: block.result },
    },
  };
}

export function projectTurnToEvents(
  blocks: TurnBlock[],
  options: ProjectTurnOptions = {},
): ProjectedEvent[] {
  // Filter whitespace-only text blocks; keep tool_use blocks as-is.
  const filtered = blocks.filter((b) => {
    if (b.type === "text") return b.text.trim().length > 0;
    return true;
  });
  if (filtered.length === 0) return [];

  // The concluding text block is the LAST text block in the filtered list,
  // and only if there is no tool_use after it. Walk back from the end:
  // first text we hit is the concluding one; if we hit a tool_use first,
  // no concluding text exists (every text block becomes arbitrary).
  let concludingIdx = -1;
  for (let i = filtered.length - 1; i >= 0; i--) {
    const b = filtered[i];
    if (!b) continue;
    if (b.type === "text") {
      concludingIdx = i;
      break;
    }
    if (b.type === "tool_use") break;
  }

  const out: ProjectedEvent[] = [];
  for (let i = 0; i < filtered.length; i++) {
    const b = filtered[i];
    if (b === undefined) continue;
    if (b.type === "text") {
      out.push({
        kind: "prose",
        content: b.text,
        arbitrary: i !== concludingIdx,
      });
      continue;
    }
    const projectedSubagent = projectSubagentTool(b, options, out.length);
    if (projectedSubagent !== null) {
      out.push(projectedSubagent.run);
      if (projectedSubagent.output !== undefined) out.push(projectedSubagent.output);
      continue;
    }
    out.push({
      kind: "tool-use",
      tool_name: b.name,
      tool_use_id: b.id,
      input: b.input,
      result: b.result,
      success: !b.is_error,
    });
  }
  return out;
}
