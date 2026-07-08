import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extractLastAssistantTurn, type TurnBlock } from "../../src/hooks/transcript.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = (name: string) => join(here, "fixtures", name);

async function load(name: string): Promise<string> {
  return readFile(fixturePath(name), "utf8");
}

describe("extractLastAssistantTurn", () => {
  it("returns the single text block for a plain reply", async () => {
    const turn = extractLastAssistantTurn(await load("transcript-simple.jsonl"));
    expect(turn).toEqual([{ type: "text", text: "hello!" }]);
  });

  it("interleaves text + tool_use + text, pairs tool_result by id", async () => {
    const turn = extractLastAssistantTurn(await load("transcript-tool-loop.jsonl"));
    expect(turn).toEqual<TurnBlock[]>([
      { type: "text", text: "I'll search." },
      {
        type: "tool_use",
        id: "tu_1",
        name: "Bash",
        input: { command: "ls" },
        result: "a\nb\n",
        is_error: false,
      },
      { type: "text", text: "Found two files: a, b." },
    ]);
  });

  it("returns a turn with no trailing text when the model ended on a tool call", async () => {
    const turn = extractLastAssistantTurn(
      await load("transcript-mid-turn-no-conclusion.jsonl"),
    );
    expect(turn).toHaveLength(1);
    expect(turn[0].type).toBe("tool_use");
  });

  it("only returns the most recent turn", async () => {
    const turn = extractLastAssistantTurn(await load("transcript-prior-turn.jsonl"));
    expect(turn).toEqual([{ type: "text", text: "reply2" }]);
  });

  it("returns empty array when transcript ends mid user message", async () => {
    const onlyUser = `{"role":"user","content":[{"type":"text","text":"hi"}]}\n`;
    expect(extractLastAssistantTurn(onlyUser)).toEqual([]);
  });

  it("extracts Codex wait_agent results and assistant text", () => {
    const codex = [
      { type: "event_msg", payload: { type: "task_started" } },
      {
        type: "response_item",
        payload: {
          type: "function_call",
          call_id: "spawn-1",
          name: "spawn_agent",
          namespace: "multi_agent_v1",
          arguments: JSON.stringify({ message: "check it", agent_name: "Scout" }),
        },
      },
      {
        type: "response_item",
        payload: {
          type: "function_call_output",
          call_id: "spawn-1",
          output: JSON.stringify({ agent_id: "agent-a", nickname: "Scouty" }),
        },
      },
      {
        type: "response_item",
        payload: {
          type: "function_call",
          call_id: "wait-1",
          name: "wait_agent",
          namespace: "multi_agent_v1",
          arguments: { agent_ids: ["agent-a"] },
        },
      },
      {
        type: "response_item",
        payload: {
          type: "function_call_output",
          call_id: "wait-1",
          output: {
            status: {
              "agent-a": { status: "completed", message: "done" },
            },
          },
        },
      },
      {
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "Final answer" }],
        },
      },
    ]
      .map((entry) => JSON.stringify(entry))
      .join("\n");

    expect(extractLastAssistantTurn(codex)).toEqual<TurnBlock[]>([
      {
        type: "tool_use",
        id: "wait-1:agent-a",
        name: "codex_subagent",
        input: {
          message: "check it",
          agent_name: "Scouty",
          agent_id: "agent-a",
          wait_arguments: { agent_ids: ["agent-a"] },
          status: "completed",
        },
        result: "done",
        is_error: false,
      },
      { type: "text", text: "Final answer" },
    ]);
  });

  it("extracts Codex collab_tool_call wait results", () => {
    const codex = [
      { type: "event_msg", payload: { type: "task_started" } },
      {
        type: "item.completed",
        item: {
          type: "collab_tool_call",
          id: "spawn-item",
          tool: "spawn_agent",
          prompt: "inspect",
          receiver_thread_ids: ["agent-b", 42],
        },
      },
      {
        type: "item.completed",
        item: {
          type: "collab_tool_call",
          id: "wait-item",
          tool: "wait",
          agents_states: {
            "agent-b": "looks good",
          },
        },
      },
    ]
      .map((entry) => JSON.stringify(entry))
      .join("\n");

    expect(extractLastAssistantTurn(codex)).toEqual<TurnBlock[]>([
      {
        type: "tool_use",
        id: "wait-item:agent-b",
        name: "codex_subagent",
        input: {
          message: "inspect",
          agent_id: "agent-b",
          status: "completed",
        },
        result: "looks good",
        is_error: false,
      },
    ]);
  });

  it("uses Codex agent messages only when no assistant message was emitted", () => {
    const codex = [
      { type: "event_msg", payload: { type: "task_started" } },
      {
        type: "item.completed",
        item: { type: "agent_message", text: "fallback item" },
      },
      {
        type: "response_item",
        payload: { type: "agent_message", message: "fallback payload" },
      },
    ]
      .map((entry) => JSON.stringify(entry))
      .join("\n");

    expect(extractLastAssistantTurn(codex)).toEqual([
      { type: "text", text: "fallback item" },
      { type: "text", text: "fallback payload" },
    ]);
  });
});
