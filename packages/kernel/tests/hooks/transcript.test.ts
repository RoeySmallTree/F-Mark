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
});
