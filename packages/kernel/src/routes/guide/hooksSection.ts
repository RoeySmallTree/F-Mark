import { renderClaudeInstallSnippet } from "../../hooksInstall/claude.js";
import { renderCodexInstallSnippet } from "../../hooksInstall/codex.js";
import { renderOpencodeInstallSnippet } from "../../hooksInstall/opencode.js";

export function renderHooksSection(
  runtimeId: string | undefined,
  agentId: string | undefined,
  userParticipantId: string,
): string {
  const userPlaceholder = userParticipantId;
  const agentPlaceholder = agentId ?? "<your-agent-id>";
  if (runtimeId === "claude") {
    return [
      "### Hooks (Claude Code)",
      "",
      renderClaudeInstallSnippet(),
    ].join("\n");
  }
  if (runtimeId === "codex") {
    return [
      "### Hooks (Codex)",
      "",
      renderCodexInstallSnippet(agentPlaceholder, userPlaceholder),
    ].join("\n");
  }
  if (runtimeId === "opencode") {
    return [
      "### Hooks (Opencode)",
      "",
      renderOpencodeInstallSnippet(),
    ].join("\n");
  }
  return [
    "### Hooks",
    "",
    "F-Mark v0.4 supports these runtimes:",
    "- **Claude Code** — hooks installed in `~/.claude/settings.json`",
    "- **Codex** — hooks enabled in `~/.codex/config.toml` and installed in `~/.codex/hooks.json`",
    "- **Opencode** — an in-process plugin installed at `.opencode/plugin/fmark.ts` posts events to the kernel",
    "",
    "Pass `?runtime_id=claude|codex|opencode` to this endpoint for the install snippet.",
  ].join("\n");
}
