import type { AccessRequestSuggestion } from "@f-mark/shared";

export interface TerminalAccessPrompt {
  title: string;
  message: string;
  request_type: "command" | "permission";
  command?: string;
  description?: string;
  suggestions: AccessRequestSuggestion[];
  raw: {
    prompt_line: string;
    options: AccessRequestSuggestion[];
    tail: string;
  };
}

const ANSI_RE = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

function stripAnsi(value: string): string {
  return value.replace(ANSI_RE, "");
}

function cleanLine(value: string): string {
  return value
    .replace(/[│┃┆┊]/g, " ")
    .replace(/^[\s>›❯➜▸▹●•-]+/, "")
    .trimEnd();
}

/* Join the run of non-blank lines that starts at `index` into one string.
   `capture-pane -J` only rejoins terminal SOFT-wraps; a TUI that hard-wraps a
   long question to the pane width draws real newlines -J cannot undo, so the
   trust phrase can straddle several lines. Rejoining the paragraph lets it
   match as a whole. */
function paragraphFromLine(lines: string[], index: number): string {
  const parts: string[] = [];
  for (let i = index; i < lines.length; i++) {
    const cleaned = cleanLine(lines[i] ?? "").trim();
    if (cleaned.length === 0) break;
    parts.push(cleaned);
  }
  return parts.join(" ");
}

/* Launch-time directory-trust dialogs (codex "Do you trust the contents of
   this directory?", claude "Quick safety check: Is this a project you created
   or one you trust?"). They block the agent before hooks/MCP exist, so the
   pane poller is the only place they can be caught. In a narrow dock pane the
   claude question hard-wraps across several lines, so it is matched against a
   rejoined paragraph (see paragraphFromLine), not line by line. */
const TRUST_PROMPT_RE =
  /do you trust the (?:contents|files)|is this a project you created or one you trust/i;

function isTrustPromptLine(value: string): boolean {
  return TRUST_PROMPT_RE.test(value);
}

function isPromptLine(value: string): boolean {
  const lower = value.toLowerCase();
  if (isTrustPromptLine(value)) return true;
  return (
    /\?$/.test(value.trim()) &&
    (lower.includes("do you want to proceed") ||
      lower.includes("allow ") ||
      lower.includes("permission") ||
      lower.includes("approve"))
  );
}

/* A wrapped trust line carries explanation after the question; keep the
   message to the question sentence itself. */
function promptMessage(line: string): string {
  const match = TRUST_PROMPT_RE.exec(line);
  if (match === null) return line;
  const question = line.indexOf("?", match.index);
  const start = line.lastIndexOf(".", match.index) + 1;
  return question === -1
    ? line.slice(start).trim()
    : line.slice(start, question + 1).trim();
}

function inferDecision(label: string): "approve" | "deny" {
  const lower = label.toLowerCase();
  if (
    /^no\b/.test(lower) ||
    lower.includes("deny") ||
    lower.includes("reject") ||
    lower.includes("disallow") ||
    lower.includes("quit") ||
    lower.includes("exit") ||
    lower.includes("cancel")
  ) {
    return "deny";
  }
  return "approve";
}

function inferScope(label: string): AccessRequestSuggestion["scope"] {
  const lower = label.toLowerCase();
  if (/\bsession\b|this session|for this session/.test(lower)) return "session";
  if (
    /\balways\b|allow access|and allow|allowlist|whitelist|permanent|forever|every time|don'?t ask again|\bremember\b/.test(
      lower,
    )
  ) {
    return "always";
  }
  if (lower.includes("once")) return "once";
  return "default";
}

function parseOptionLine(line: string): AccessRequestSuggestion | null {
  const cleaned = cleanLine(line).trim();
  const match = /^(?:[>›❯]\s*)?(\d+)[.)]\s+(.+)$/.exec(cleaned);
  if (match === null) return null;
  const key = match[1]!;
  const label = match[2]!.trim();
  return {
    id: `terminal:${key}`,
    label,
    decision: inferDecision(label),
    terminal_input: key,
    scope: inferScope(label),
  };
}

interface TerminalCommandBlock {
  command: string;
  description?: string;
}

const SHELL_COMMAND_NAMES = new Set([
  "awk",
  "bun",
  "cat",
  "chmod",
  "chown",
  "cp",
  "curl",
  "echo",
  "env",
  "find",
  "grep",
  "head",
  "jq",
  "ls",
  "mkdir",
  "mv",
  "node",
  "npm",
  "pgrep",
  "pnpm",
  "ps",
  "python",
  "python3",
  "rg",
  "rm",
  "sed",
  "sort",
  "ss",
  "tail",
  "timeout",
  "touch",
  "tr",
  "yarn",
]);

function firstShellToken(line: string): string | undefined {
  const match = /^\s*(?:[A-Z_][A-Z0-9_]*=\S+\s+)*([./~\w-]+)/.exec(line);
  return match?.[1];
}

function looksLikeShellLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) return false;
  if (/[|;&<>`$"'()[\]{}]/.test(trimmed)) return true;
  if (/^(?:\.{0,2}\/|~\/|\/)/.test(trimmed)) return true;
  const token = firstShellToken(trimmed);
  if (token === undefined) return false;
  const lower = token.toLowerCase();
  return token === lower && SHELL_COMMAND_NAMES.has(lower);
}

function splitCommandDescription(block: string): TerminalCommandBlock | undefined {
  const lines = block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return undefined;

  let description: string | undefined;
  const last = lines.at(-1);
  if (
    lines.length > 1 &&
    last !== undefined &&
    /\s/.test(last) &&
    !looksLikeShellLine(last)
  ) {
    description = last;
    lines.pop();
  }

  const command = lines.join("\n").trim();
  if (command.length === 0) return undefined;
  return { command, ...(description !== undefined ? { description } : {}) };
}

function findCommand(
  lines: string[],
  promptIndex: number,
): TerminalCommandBlock | undefined {
  for (let i = promptIndex - 1; i >= 0; i--) {
    const line = cleanLine(lines[i] ?? "").trim();
    if (/^(bash|shell)\s+command$/i.test(line)) {
      const block = lines
        .slice(i + 1, promptIndex)
        .map((part) => cleanLine(part).trim())
        .filter(Boolean)
        .join("\n")
        .trim();
      return splitCommandDescription(block);
    }
  }

  for (let i = promptIndex - 1; i >= 0; i--) {
    const line = cleanLine(lines[i] ?? "").trim();
    const match = /Bash\s*\((.+)\)/i.exec(line);
    if (match !== null) {
      const command = match[1]!.trim();
      return command.length > 0 ? { command } : undefined;
    }
  }

  return undefined;
}

export function extractTerminalAccessPrompt(
  snapshot: string,
): TerminalAccessPrompt | null {
  const stripped = stripAnsi(snapshot).replace(/\r\n/g, "\n");
  const allLines = stripped.split("\n");
  const tailStart = Math.max(0, allLines.length - 120);
  const lines = allLines.slice(tailStart);
  let promptIndex = -1;
  let promptLine = "";
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = cleanLine(lines[i] ?? "").trim();
    if (isPromptLine(line)) {
      promptIndex = i;
      promptLine = line;
      break;
    }
    /* A trust question can hard-wrap across several lines in a narrow pane; no
       single line carries the whole phrase, so also test the rejoined
       paragraph starting here. Options stay one-per-line and are parsed below
       from promptIndex unchanged. */
    const paragraph = paragraphFromLine(lines, i);
    if (isTrustPromptLine(paragraph)) {
      promptIndex = i;
      promptLine = paragraph;
      break;
    }
  }
  if (promptIndex < 0) return null;

  const suggestions: AccessRequestSuggestion[] = [];
  for (let i = promptIndex + 1; i < lines.length; i++) {
    const parsed = parseOptionLine(lines[i] ?? "");
    if (parsed !== null) {
      suggestions.push(parsed);
      continue;
    }
    if (suggestions.length > 0 && cleanLine(lines[i] ?? "").trim().length === 0) {
      break;
    }
  }
  if (suggestions.length < 2) return null;

  const commandBlock = findCommand(lines, promptIndex);
  const isTrust = isTrustPromptLine(promptLine);
  const title = isTrust
    ? "Directory trust"
    : commandBlock !== undefined
      ? "Bash command"
      : "Terminal approval";

  return {
    title,
    message: promptMessage(promptLine),
    request_type: commandBlock !== undefined ? "command" : "permission",
    ...(commandBlock !== undefined ? { command: commandBlock.command } : {}),
    ...(commandBlock?.description !== undefined
      ? { description: commandBlock.description }
      : {}),
    suggestions,
    raw: {
      prompt_line: promptLine,
      options: suggestions,
      tail: lines.slice(Math.max(0, promptIndex - 24)).join("\n"),
    },
  };
}
