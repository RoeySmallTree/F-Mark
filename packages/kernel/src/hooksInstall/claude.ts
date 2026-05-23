import { homedir } from "node:os";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DetectResult, HookEntry } from "./types.js";

export function claudeConfigPath(): string {
  return join(homedir(), ".claude", "settings.json");
}

export function detectClaudeHooks(
  settings: unknown,
  agentId: string,
  userId: string,
): DetectResult {
  const detected: HookEntry[] = [];
  const s = (settings ?? {}) as {
    hooks?: Record<string, Array<{ hooks?: Array<{ type?: string; command?: string }> }>>;
  };
  const hooks = s.hooks ?? {};
  for (const event of ["Stop", "UserPromptSubmit"]) {
    const arr = hooks[event] ?? [];
    for (const group of arr) {
      for (const h of group.hooks ?? []) {
        if (typeof h.command === "string" && h.command.includes("f-mark hook auto-stream")) {
          if (
            (event === "Stop" && h.command.includes(agentId)) ||
            (event === "UserPromptSubmit" && h.command.includes(userId))
          ) {
            detected.push({ event, command: h.command });
          }
        }
      }
    }
  }
  const installed =
    detected.some((e) => e.event === "Stop") &&
    detected.some((e) => e.event === "UserPromptSubmit");
  return {
    installed,
    configPath: claudeConfigPath(),
    detectedEntries: detected,
    expectedEntries: [
      { event: "Stop", command: `npx -y f-mark hook auto-stream ${agentId}` },
      { event: "UserPromptSubmit", command: `npx -y f-mark hook auto-stream ${userId} --kind user` },
    ],
  };
}

export async function loadClaudeSettings(): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(claudeConfigPath(), "utf8"));
  } catch {
    return null;
  }
}

export function renderClaudeInstallSnippet(agentId: string, userId: string): string {
  return [
    "Add these two entries to `~/.claude/settings.json` under `hooks`:",
    "",
    "```json",
    '"hooks": {',
    '  "Stop": [',
    "    {",
    '      "hooks": [',
    `        { "type": "command", "command": "npx -y f-mark hook auto-stream ${agentId}" }`,
    "      ]",
    "    }",
    "  ],",
    '  "UserPromptSubmit": [',
    "    {",
    '      "hooks": [',
    `        { "type": "command", "command": "npx -y f-mark hook auto-stream ${userId} --kind user" }`,
    "      ]",
    "    }",
    "  ]",
    "}",
    "```",
  ].join("\n");
}
