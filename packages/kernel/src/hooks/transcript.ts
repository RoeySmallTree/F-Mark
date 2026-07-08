import {
  extractClaudeLastAssistantTurn,
  extractClaudeLastTurnUserText,
} from "./transcript/claude.js";
import {
  extractCodexLastAssistantTurn,
  extractCodexLastTurnUserText,
  isCodexJsonl,
} from "./transcript/codex.js";
import type { TurnBlock } from "./transcript/types.js";

export type { TurnBlock } from "./transcript/types.js";

function parseJsonlUnknown(raw: string): unknown[] {
  return raw
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as unknown);
}

export function extractLastAssistantTurn(raw: string): TurnBlock[] {
  const unknownEntries = parseJsonlUnknown(raw);
  if (isCodexJsonl(unknownEntries)) {
    return extractCodexLastAssistantTurn(unknownEntries);
  }

  return extractClaudeLastAssistantTurn(unknownEntries);
}

/** Text of the user message that triggered the transcript's last turn, or
    `null` when none exists. Used by the Stop-recovery path to tell F-Mark
    driven turns (wake/launch packets) apart from runtime-internal turns
    (e.g. Codex memory maintenance) whose output must never be posted. */
export function extractLastTurnUserText(raw: string): string | null {
  const unknownEntries = parseJsonlUnknown(raw);
  if (isCodexJsonl(unknownEntries)) {
    return extractCodexLastTurnUserText(unknownEntries);
  }

  return extractClaudeLastTurnUserText(unknownEntries);
}
