import { detectClaudeHooks, loadClaudeSettings, renderClaudeInstallSnippet } from "./claude.js";
import { detectCodexHooks, loadCodexConfig, renderCodexInstallSnippet } from "./codex.js";
import { detectGeminiHooks, renderGeminiInstallSnippet } from "./gemini.js";
import type { DetectResult } from "./types.js";

export async function checkHookInstallStatus(opts: {
  runtimeId: string;
  participantId: string;
  userParticipantId?: string;
}): Promise<DetectResult> {
  const userId = opts.userParticipantId ?? "us-unknown";
  if (opts.runtimeId === "claude") {
    const settings = await loadClaudeSettings();
    return detectClaudeHooks(settings ?? {}, opts.participantId, userId);
  }
  if (opts.runtimeId === "codex") {
    const toml = await loadCodexConfig();
    return detectCodexHooks(toml, opts.participantId, userId);
  }
  if (opts.runtimeId === "gemini") return detectGeminiHooks();
  throw new Error(`unknown runtime_id: ${opts.runtimeId}`);
}

export function renderInstallInstructions(opts: {
  runtimeId: string;
  participantId: string;
  userParticipantId: string;
}): { markdown: string; manualSteps: { configPath: string; snippet: string }[] } {
  if (opts.runtimeId === "claude") {
    const snippet = renderClaudeInstallSnippet(opts.participantId, opts.userParticipantId);
    return { markdown: snippet, manualSteps: [{ configPath: "~/.claude/settings.json", snippet }] };
  }
  if (opts.runtimeId === "codex") {
    const snippet = renderCodexInstallSnippet(opts.participantId, opts.userParticipantId);
    return { markdown: snippet, manualSteps: [{ configPath: "~/.codex/config.toml", snippet }] };
  }
  if (opts.runtimeId === "gemini") {
    const snippet = renderGeminiInstallSnippet();
    return { markdown: snippet, manualSteps: [] };
  }
  throw new Error(`unknown runtime_id: ${opts.runtimeId}`);
}
