import type { DetectResult } from "./types.js";

export function detectGeminiHooks(): DetectResult {
  return {
    installed: false,
    configPath: "(manual-stream mode — no hooks needed in v0.4)",
    detectedEntries: [],
    expectedEntries: [],
  };
}

export function renderGeminiInstallSnippet(): string {
  return "Gemini CLI uses **manual-stream mode** in F-Mark v0.4. The model itself POSTs prose, tool-use, and turn-end events — no hooks needed. See `.f-mark/AGENT.md` for the protocol the model follows.";
}
