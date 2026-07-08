import type { TurnBlock } from "./types.js";

interface RawEntry {
  role: "user" | "assistant" | string;
  content: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: unknown }
    | { type: "tool_result"; tool_use_id: string; content: unknown; is_error?: boolean }
    | { type: string; [k: string]: unknown }
  >;
}

type ToolResult = { content: unknown; is_error: boolean };
type RawContentBlock = RawEntry["content"][number];

export function extractClaudeLastAssistantTurn(entries: unknown[]): TurnBlock[] {
  return new ClaudeLastAssistantTurnExtractor(entries as RawEntry[]).extract();
}

/** Text of the user message that opened the transcript's last turn — the
    last user entry that carries real text (tool_result-only entries are
    turn-internal plumbing, not a turn trigger). `null` when none exists. */
export function extractClaudeLastTurnUserText(entries: unknown[]): string | null {
  const raw = entries as RawEntry[];
  for (let i = raw.length - 1; i >= 0; i--) {
    const entry = raw[i];
    if (entry === undefined || entry.role !== "user") continue;
    if (isToolResultOnly(entry)) continue;
    const text = userEntryText(entry);
    if (text !== null) return text;
  }
  return null;
}

function userEntryText(entry: RawEntry): string | null {
  if (typeof (entry as { content: unknown }).content === "string") {
    const content = (entry as unknown as { content: string }).content.trim();
    return content.length > 0 ? content : null;
  }
  if (!Array.isArray(entry.content)) return null;
  const parts = entry.content
    .filter(isTextBlock)
    .map((block) => block.text)
    .filter((text) => text.trim().length > 0);
  const joined = parts.join("\n").trim();
  return joined.length > 0 ? joined : null;
}

class ClaudeLastAssistantTurnExtractor {
  constructor(private readonly entries: RawEntry[]) {}

  extract(): TurnBlock[] {
    const end = this.lastAssistantIndex();
    if (end < 0) return [];

    const start = this.turnStartIndex(end);
    const results = this.collectToolResults(start, end);
    return this.collectAssistantBlocks(start, end, results);
  }

  private lastAssistantIndex(): number {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (this.entries[i]?.role === "assistant") return i;
    }
    return -1;
  }

  private turnStartIndex(end: number): number {
    let start = end;
    while (start - 1 >= 0 && continuesAssistantTurn(this.entries[start - 1])) {
      start -= 1;
    }
    return start;
  }

  private collectToolResults(start: number, end: number): Map<string, ToolResult> {
    const resultById = new Map<string, ToolResult>();

    for (const entry of this.slice(start, end)) {
      if (entry.role === "user") collectEntryToolResults(entry, resultById);
    }

    return resultById;
  }

  private collectAssistantBlocks(
    start: number,
    end: number,
    resultById: Map<string, ToolResult>,
  ): TurnBlock[] {
    const blocks: TurnBlock[] = [];

    for (const entry of this.slice(start, end)) {
      if (entry.role === "assistant") {
        blocks.push(...assistantEntryBlocks(entry, resultById));
      }
    }

    return blocks;
  }

  private slice(start: number, end: number): RawEntry[] {
    return this.entries.slice(start, end + 1).filter(isRawEntry);
  }
}

function continuesAssistantTurn(entry: RawEntry | undefined): boolean {
  if (entry === undefined) return false;
  if (entry.role === "assistant") return true;
  return isToolResultOnly(entry);
}

function collectEntryToolResults(
  entry: RawEntry,
  resultById: Map<string, ToolResult>,
): void {
  for (const block of entry.content) {
    if (isToolResultBlock(block)) {
      resultById.set(block.tool_use_id, {
        content: block.content,
        is_error: block.is_error === true,
      });
    }
  }
}

function assistantEntryBlocks(
  entry: RawEntry,
  resultById: Map<string, ToolResult>,
): TurnBlock[] {
  return entry.content
    .map((block) => assistantBlock(block, resultById))
    .filter((block): block is TurnBlock => block !== null);
}

function assistantBlock(
  block: RawContentBlock,
  resultById: Map<string, ToolResult>,
): TurnBlock | null {
  return textTurnBlock(block) ?? toolUseTurnBlock(block, resultById);
}

function textTurnBlock(block: RawContentBlock): TurnBlock | null {
  if (!isTextBlock(block)) return null;
  return { type: "text", text: block.text };
}

function toolUseTurnBlock(
  block: RawContentBlock,
  resultById: Map<string, ToolResult>,
): TurnBlock | null {
  if (!isToolUseBlock(block)) return null;
  return toolUseWithResult(block, resultById.get(block.id));
}

function toolUseWithResult(
  block: { type: "tool_use"; id: string; name: string; input: unknown },
  result: ToolResult | undefined,
): TurnBlock {
  return {
    type: "tool_use",
    id: block.id,
    name: block.name,
    input: block.input,
    result: resultContent(result),
    is_error: resultIsError(result),
  };
}

function resultContent(result: ToolResult | undefined): unknown {
  if (result === undefined) return undefined;
  return result.content;
}

function resultIsError(result: ToolResult | undefined): boolean {
  if (result === undefined) return false;
  return result.is_error;
}

function isToolResultOnly(entry: RawEntry): boolean {
  return (
    entry.role === "user" &&
    entry.content.length > 0 &&
    entry.content.every((block) => block.type === "tool_result")
  );
}

function isRawEntry(value: RawEntry | undefined): value is RawEntry {
  return value !== undefined;
}

function isTextBlock(
  block: RawContentBlock,
): block is { type: "text"; text: string } {
  return block.type === "text" && typeof block.text === "string";
}

function isToolUseBlock(
  block: RawContentBlock,
): block is { type: "tool_use"; id: string; name: string; input: unknown } {
  return (
    block.type === "tool_use" &&
    typeof block.id === "string" &&
    typeof block.name === "string"
  );
}

function isToolResultBlock(
  block: RawContentBlock,
): block is {
  type: "tool_result";
  tool_use_id: string;
  content: unknown;
  is_error?: boolean;
} {
  return block.type === "tool_result" && typeof block.tool_use_id === "string";
}
