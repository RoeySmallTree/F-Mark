import { describe, it, expect } from "vitest";
import { serializeToolUse, parseToolUse } from "../../src/events/toolUse";
import type { ToolUsePayload } from "@f-mark/shared";

describe("toolUse serialize/parse", () => {
  const sample: ToolUsePayload = {
    tool_name: "Bash",
    tool_use_id: "tu_01HABC",
    input: { command: "ls -la" },
    result: "total 0\n",
    success: true,
    duration_ms: 14,
  };

  it("round-trips a fully populated payload", () => {
    const raw = serializeToolUse(sample);
    expect(JSON.parse(raw)).toEqual(sample);
    expect(parseToolUse(raw)).toEqual(sample);
  });

  it("rejects payload missing tool_name on parse", () => {
    expect(() => parseToolUse(JSON.stringify({ tool_use_id: "x", input: {}, success: true }))).toThrow();
  });

  it("preserves structured (non-string) result", () => {
    const p: ToolUsePayload = {
      tool_name: "Read",
      tool_use_id: "tu_2",
      input: { file_path: "/a.txt" },
      result: { lines: ["a", "b"] },
      success: true,
    };
    expect(parseToolUse(serializeToolUse(p))).toEqual(p);
  });

  it("treats success=false as preserved", () => {
    const p: ToolUsePayload = {
      tool_name: "Edit",
      tool_use_id: "tu_3",
      input: {},
      result: "permission denied",
      success: false,
    };
    expect(parseToolUse(serializeToolUse(p))).toEqual(p);
  });
});
