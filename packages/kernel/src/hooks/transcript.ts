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

function parseJsonl(raw: string): RawEntry[] {
  return raw
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as RawEntry);
}

function isToolResultOnly(entry: RawEntry): boolean {
  return (
    entry.role === "user" &&
    entry.content.length > 0 &&
    entry.content.every((b) => b.type === "tool_result")
  );
}

export function extractLastAssistantTurn(raw: string): TurnBlock[] {
  const entries = parseJsonl(raw);

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
      // Ignore other block types (thinking, etc.)
    }
  }
  return out;
}
