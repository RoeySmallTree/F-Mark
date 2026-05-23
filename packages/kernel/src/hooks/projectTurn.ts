import type { TurnBlock } from "./transcript.js";

export type ProjectedEvent =
  | { kind: "prose"; content: string; arbitrary: boolean }
  | {
      kind: "tool-use";
      tool_name: string;
      tool_use_id: string;
      input: unknown;
      result: unknown;
      success: boolean;
    };

export function projectTurnToEvents(blocks: TurnBlock[]): ProjectedEvent[] {
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

  return filtered.map((b, i) => {
    if (b.type === "text") {
      return {
        kind: "prose",
        content: b.text,
        arbitrary: i !== concludingIdx,
      };
    }
    return {
      kind: "tool-use",
      tool_name: b.name,
      tool_use_id: b.id,
      input: b.input,
      result: b.result,
      success: !b.is_error,
    };
  });
}
