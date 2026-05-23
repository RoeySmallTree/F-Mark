import { homedir } from "node:os";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DetectResult, HookEntry } from "./types.js";

export function codexConfigPath(): string {
  return join(homedir(), ".codex", "config.toml");
}

// Regex over the TOML to find [[hooks.<event>]] blocks with a command including auto-stream.
// Handles command lines as either ["npx", ...] arrays or "npx ..." strings.
const HOOK_BLOCK_RE = /\[\[hooks\.(Stop|UserPromptSubmit)\]\]\s*[\s\S]*?command\s*=\s*([\[\"][^\n]+)/g;

export function detectCodexHooks(toml: string, agentId: string, userId: string): DetectResult {
  const detected: HookEntry[] = [];
  let m: RegExpExecArray | null;
  HOOK_BLOCK_RE.lastIndex = 0;
  while ((m = HOOK_BLOCK_RE.exec(toml)) !== null) {
    const event = m[1]!;
    const cmd = m[2]!;
    if (cmd.includes("f-mark") && cmd.includes("auto-stream")) {
      if (
        (event === "Stop" && cmd.includes(agentId)) ||
        (event === "UserPromptSubmit" && cmd.includes(userId))
      ) {
        detected.push({ event, command: cmd });
      }
    }
  }
  const installed =
    detected.some((e) => e.event === "Stop") &&
    detected.some((e) => e.event === "UserPromptSubmit");
  return {
    installed,
    configPath: codexConfigPath(),
    detectedEntries: detected,
    expectedEntries: [
      { event: "Stop", command: `["npx", "-y", "f-mark", "hook", "auto-stream", "${agentId}"]` },
      {
        event: "UserPromptSubmit",
        command: `["npx", "-y", "f-mark", "hook", "auto-stream", "${userId}", "--kind", "user"]`,
      },
    ],
  };
}

export async function loadCodexConfig(): Promise<string> {
  try {
    return await readFile(codexConfigPath(), "utf8");
  } catch {
    return "";
  }
}

export function renderCodexInstallSnippet(agentId: string, userId: string): string {
  return [
    "Add to `~/.codex/config.toml` (or `.codex/config.toml` for project-scoped):",
    "",
    "```toml",
    "[[hooks.Stop]]",
    `command = ["npx", "-y", "f-mark", "hook", "auto-stream", "${agentId}"]`,
    "timeout = 30",
    "",
    "[[hooks.UserPromptSubmit]]",
    `command = ["npx", "-y", "f-mark", "hook", "auto-stream", "${userId}", "--kind", "user"]`,
    "timeout = 10",
    "```",
    "",
    "On first run, Codex will prompt you to trust the hook command. Approve once.",
  ].join("\n");
}
