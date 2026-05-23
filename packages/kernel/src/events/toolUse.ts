import type { ToolUsePayload } from "@f-mark/shared";

export function serializeToolUse(payload: ToolUsePayload): string {
  return JSON.stringify(payload, null, 2);
}

export function parseToolUse(raw: string): ToolUsePayload {
  const data = JSON.parse(raw) as Partial<ToolUsePayload>;
  if (typeof data.tool_name !== "string" || data.tool_name.length === 0) {
    throw new Error("tool-use payload missing tool_name");
  }
  if (typeof data.tool_use_id !== "string" || data.tool_use_id.length === 0) {
    throw new Error("tool-use payload missing tool_use_id");
  }
  if (typeof data.success !== "boolean") {
    throw new Error("tool-use payload missing success");
  }
  return {
    tool_name: data.tool_name,
    tool_use_id: data.tool_use_id,
    input: data.input ?? {},
    result: data.result,
    success: data.success,
    duration_ms: typeof data.duration_ms === "number" ? data.duration_ms : undefined,
  };
}
