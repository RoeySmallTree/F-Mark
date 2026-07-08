import { renderClaudeInstallSnippet } from "../../hooksInstall/claude.js";
import { renderOpencodeInstallSnippet } from "../../hooksInstall/opencode.js";

export function renderHooksSection(
  runtimeId: string | undefined,
  agentId: string | undefined,
  userParticipantId: string,
): string {
  void agentId;
  void userParticipantId;
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
      "F-Mark injects the `fmark` MCP server and its autostream hooks directly into each managed Codex launch (via `codex -c` overrides). No manual `~/.codex` setup is required, and manually-launched Codex sessions stay free of the fmark MCP server and hooks.",
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
    "- **Codex** — the `fmark` MCP server and hooks are injected into each managed Codex launch (no machine-global `~/.codex` install)",
    "- **Opencode** — an in-process plugin installed at `.opencode/plugin/fmark.ts` posts events to the kernel",
    "",
    "Pass `?runtime_id=claude|codex|opencode` to this endpoint for the install snippet.",
  ].join("\n");
}
