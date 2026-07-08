import { createCodexHookSnippet } from "./spec.js";

export function renderCodexInstallSnippet(agentId?: string, userId?: string): string {
  const hooks = createCodexHookSnippet(agentId, userId);
  return [
    "Enable hooks in `~/.codex/config.toml`:",
    "",
    "```toml",
    "[features]",
    "hooks = true",
    "```",
    "",
    "Then add to `~/.codex/hooks.json`:",
    "",
    "```json",
    JSON.stringify(hooks, null, 2),
    "```",
    "",
    "On first run, Codex will prompt you to trust the hook command. Approve once.",
  ].join("\n");
}
