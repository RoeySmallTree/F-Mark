import { describe, it, expect } from "vitest";
import { projectTurnToEvents, type ProjectedEvent } from "../../src/hooks/projectTurn.js";
import type { TurnBlock } from "../../src/hooks/transcript.js";

describe("projectTurnToEvents", () => {
  it("single text block → one concluding prose (arbitrary=false)", () => {
    const blocks: TurnBlock[] = [{ type: "text", text: "hello" }];
    expect(projectTurnToEvents(blocks)).toEqual<ProjectedEvent[]>([
      { kind: "prose", content: "hello", arbitrary: false },
    ]);
  });

  it("text + tool + text → arbitrary prose, tool-use, concluding prose", () => {
    const blocks: TurnBlock[] = [
      { type: "text", text: "I'll search." },
      {
        type: "tool_use",
        id: "tu_1",
        name: "Bash",
        input: { command: "ls" },
        result: "a\nb",
        is_error: false,
      },
      { type: "text", text: "Done." },
    ];
    expect(projectTurnToEvents(blocks)).toEqual<ProjectedEvent[]>([
      { kind: "prose", content: "I'll search.", arbitrary: true },
      {
        kind: "tool-use",
        tool_name: "Bash",
        tool_use_id: "tu_1",
        input: { command: "ls" },
        result: "a\nb",
        success: true,
      },
      { kind: "prose", content: "Done.", arbitrary: false },
    ]);
  });

  it("tool-only turn → only tool-use, no prose (group stays open)", () => {
    const blocks: TurnBlock[] = [
      { type: "tool_use", id: "x", name: "Read", input: {}, result: "", is_error: false },
    ];
    expect(projectTurnToEvents(blocks)).toEqual<ProjectedEvent[]>([
      { kind: "tool-use", tool_name: "Read", tool_use_id: "x", input: {}, result: "", success: true },
    ]);
  });

  it("drops empty/whitespace-only text blocks", () => {
    const blocks: TurnBlock[] = [
      { type: "text", text: "   " },
      { type: "tool_use", id: "x", name: "Read", input: {}, is_error: false },
      { type: "text", text: "\n\n" },
      { type: "text", text: "done." },
    ];
    expect(projectTurnToEvents(blocks)).toEqual<ProjectedEvent[]>([
      { kind: "tool-use", tool_name: "Read", tool_use_id: "x", input: {}, result: undefined, success: true },
      { kind: "prose", content: "done.", arbitrary: false },
    ]);
  });

  it("returns empty array when the whole turn was whitespace text only", () => {
    expect(projectTurnToEvents([{ type: "text", text: "  " }])).toEqual([]);
  });

  it("propagates is_error as success=false", () => {
    const blocks: TurnBlock[] = [
      { type: "tool_use", id: "x", name: "Bash", input: {}, result: "boom", is_error: true },
    ];
    const out = projectTurnToEvents(blocks);
    expect(out[0]).toMatchObject({ kind: "tool-use", success: false });
  });
});
