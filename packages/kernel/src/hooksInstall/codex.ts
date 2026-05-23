import { homedir } from "node:os";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DetectResult, HookEntry } from "./types.js";

export function codexConfigPath(): string {
  return join(homedir(), ".codex", "config.toml");
}

/**
 * Strip TOML comments from a line: anything after an unquoted `#` is dropped.
 * Honors basic single/double-quoted strings (with backslash escape) so that a
 * `#` inside a string literal is preserved. This is a best-effort heuristic —
 * full TOML literal-string semantics are beyond what v0.4 detection needs.
 */
function stripTomlCommentsFromLine(line: string): string {
  let inStr = false;
  let quoteCh = "";
  let out = "";
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (inStr) {
      out += c;
      if (c === quoteCh && line[i - 1] !== "\\") {
        inStr = false;
        quoteCh = "";
      }
    } else if (c === "#") {
      break; // comment to EOL
    } else {
      out += c;
      if (c === '"' || c === "'") {
        inStr = true;
        quoteCh = c;
      }
    }
  }
  return out;
}

function stripTomlComments(toml: string): string {
  return toml.split("\n").map(stripTomlCommentsFromLine).join("\n");
}

/**
 * Scan TOML for `[[hooks.<Event>]]` blocks and return each block's `command`
 * value as a raw string (joined for multi-line arrays). The scanner tracks
 * bracket depth so multi-line `command = [\n ... \n]` values are captured
 * intact, and commented-out lines are dropped before scanning.
 */
export function findHookCommands(toml: string): { event: string; command: string }[] {
  const cleaned = stripTomlComments(toml);
  const results: { event: string; command: string }[] = [];
  const lines = cleaned.split("\n");
  let currentEvent: string | null = null;
  let buffering = false;
  let bufferDepth = 0;
  let buffer = "";
  const headerRe = /^\[\[hooks\.([A-Za-z]+)\]\]$/;
  const commandRe = /^command\s*=\s*(.+)$/;
  for (const raw of lines) {
    const line = raw.trim();
    // A new table header always ends any prior multi-line buffer (best-effort).
    if (line.startsWith("[")) {
      if (buffering && buffer) {
        results.push({ event: currentEvent ?? "", command: buffer });
        buffering = false;
        buffer = "";
        bufferDepth = 0;
      }
      const m = headerRe.exec(line);
      currentEvent = m ? m[1]! : null;
      continue;
    }
    if (currentEvent === null) continue;
    if (!buffering) {
      const cm = commandRe.exec(line);
      if (!cm) continue;
      const rhs = cm[1]!;
      // Compute bracket depth from this initial fragment.
      let depth = 0;
      for (const c of rhs) {
        if (c === "[") depth++;
        else if (c === "]") depth--;
      }
      if (depth > 0) {
        buffering = true;
        bufferDepth = depth;
        buffer = rhs;
      } else {
        results.push({ event: currentEvent, command: rhs });
      }
    } else {
      buffer += " " + line;
      for (const c of line) {
        if (c === "[") bufferDepth++;
        else if (c === "]") bufferDepth--;
      }
      if (bufferDepth <= 0) {
        results.push({ event: currentEvent, command: buffer });
        buffering = false;
        buffer = "";
        bufferDepth = 0;
      }
    }
  }
  if (buffering && buffer) {
    // Unterminated buffer — still emit so callers can see what was there.
    results.push({ event: currentEvent ?? "", command: buffer });
  }
  return results;
}

export function detectCodexHooks(toml: string, agentId: string, userId: string): DetectResult {
  const detected: HookEntry[] = [];
  const hits = findHookCommands(toml);
  for (const { event, command } of hits) {
    if (event !== "Stop" && event !== "UserPromptSubmit") continue;
    if (!command.includes("f-mark") || !command.includes("auto-stream")) continue;
    if (
      (event === "Stop" && command.includes(agentId)) ||
      (event === "UserPromptSubmit" && command.includes(userId))
    ) {
      detected.push({ event, command });
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

export async function loadCodexConfig(projectRoot?: string): Promise<string> {
  const parts: string[] = [];
  try {
    parts.push(await readFile(codexConfigPath(), "utf8"));
  } catch {
    // user-level config missing — that's fine
  }
  if (projectRoot) {
    try {
      parts.push(await readFile(join(projectRoot, ".codex", "config.toml"), "utf8"));
    } catch {
      // project-local config missing — that's fine
    }
  }
  return parts.join("\n");
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
