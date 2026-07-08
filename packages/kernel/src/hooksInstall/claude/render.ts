import { createClaudeHookSnippet } from "./spec.js";

export function renderClaudeInstallSnippet(): string {
  const snippet = createClaudeHookSnippet();
  return [
    "Merge this into `.claude/settings.json` or `~/.claude/settings.json`:",
    "",
    "```json",
    JSON.stringify(snippet, null, 2),
    "```",
  ].join("\n");
}

export function renderClaudeInstallPrompt(): string {
  const snippet = renderClaudeInstallSnippet();
  return [
    "Please install the F-Mark Claude hooks for this project.",
    "",
    "Merge the following `hooks` entry into the closest Claude settings file for this project. Preserve existing settings and existing hook entries. If a matching command already exists, do not duplicate it.",
    "",
    snippet,
  ].join("\n");
}
