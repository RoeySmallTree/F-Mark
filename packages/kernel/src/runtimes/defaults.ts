import type { RuntimeEntryShape } from "./validation.js";

export const DEFAULT_RUNTIMES: Record<string, RuntimeEntryShape> = {
  claude: { displayName: "Claude Code", executable: "claude", args: [], icon: "claude", readyDelayMs: 2000 },
  codex:  { displayName: "Codex",       executable: "codex",  args: [], icon: "codex",  readyDelayMs: 1500 },
  gemini: { displayName: "Gemini",      executable: "gemini", args: [], icon: "gemini", readyDelayMs: 1500 },
};
