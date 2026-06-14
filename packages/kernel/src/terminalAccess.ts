import type { AccessRequestSuggestion } from "@f-mark/shared";

export interface TerminalAccessPrompt {
  title: string;
  message: string;
  request_type: "command" | "permission";
  command?: string;
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

function isPromptLine(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    /\?$/.test(value.trim()) &&
    (lower.includes("do you want to proceed") ||
      lower.includes("allow ") ||
      lower.includes("permission") ||
      lower.includes("approve"))
  );
}

function inferDecision(label: string): "approve" | "deny" {
  const lower = label.toLowerCase();
  if (
    lower === "no" ||
    lower.includes("deny") ||
    lower.includes("reject") ||
    lower.includes("disallow") ||
    lower.includes("cancel")
  ) {
    return "deny";
  }
  return "approve";
}

function inferScope(label: string): AccessRequestSuggestion["scope"] {
  const lower = label.toLowerCase();
  if (lower.includes("always")) return "always";
  if (lower.includes("session")) return "session";
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

function findCommand(lines: string[], promptIndex: number): string | undefined {
  for (let i = promptIndex - 1; i >= 0; i--) {
    const line = cleanLine(lines[i] ?? "").trim();
    if (/^(bash|shell)\s+command$/i.test(line)) {
      const command = lines
        .slice(i + 1, promptIndex)
        .map((part) => cleanLine(part).trim())
        .filter(Boolean)
        .join("\n")
        .trim();
      return command.length > 0 ? command : undefined;
    }
  }

  for (let i = promptIndex - 1; i >= 0; i--) {
    const line = cleanLine(lines[i] ?? "").trim();
    const match = /Bash\s*\((.+)\)/i.exec(line);
    if (match !== null) return match[1]!.trim();
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
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = cleanLine(lines[i] ?? "").trim();
    if (isPromptLine(line)) {
      promptIndex = i;
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

  const promptLine = cleanLine(lines[promptIndex] ?? "").trim();
  const command = findCommand(lines, promptIndex);
  const title = command !== undefined ? "Bash command" : "Terminal approval";

  return {
    title,
    message: promptLine,
    request_type: command !== undefined ? "command" : "permission",
    ...(command !== undefined ? { command } : {}),
    suggestions,
    raw: {
      prompt_line: promptLine,
      options: suggestions,
      tail: lines.slice(Math.max(0, promptIndex - 24)).join("\n"),
    },
  };
}
