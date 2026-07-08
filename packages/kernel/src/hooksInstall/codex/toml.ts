/**
 * Strip TOML comments from a line: anything after an unquoted `#` is dropped.
 * Honors basic single/double-quoted strings (with backslash escape) so that a
 * `#` inside a string literal is preserved. This is a best-effort heuristic;
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
      break;
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
 * value as a raw string. The scanner tracks bracket depth so multi-line
 * `command = [\n ... \n]` values are captured intact, and commented-out lines
 * are dropped before scanning.
 */
export function findHookCommands(
  toml: string,
): { event: string; command: string; matcher?: string | null }[] {
  return new TomlHookCommandScanner(stripTomlComments(toml)).scan();
}

class TomlHookCommandScanner {
  private readonly results: { event: string; command: string; matcher?: string | null }[] = [];
  private currentEvent: string | null = null;
  private buffering = false;
  private bufferDepth = 0;
  private buffer = "";

  constructor(private readonly toml: string) {}

  scan(): { event: string; command: string; matcher?: string | null }[] {
    for (const raw of this.toml.split("\n")) {
      this.consumeLine(raw.trim());
    }
    this.flushUnterminatedBuffer();
    return this.results;
  }

  private consumeLine(line: string): void {
    if (line.startsWith("[")) {
      this.consumeHeader(line);
      return;
    }
    if (this.currentEvent === null) return;
    if (this.buffering) {
      this.consumeBufferedLine(line);
      return;
    }
    this.consumePossibleCommand(line);
  }

  private consumeHeader(line: string): void {
    this.flushUnterminatedBuffer();
    this.currentEvent = hookEventFromHeader(line);
  }

  private consumePossibleCommand(line: string): void {
    const rhs = commandValueFromLine(line);
    if (rhs === null) return;
    const depth = bracketDelta(rhs);
    if (depth > 0) {
      this.buffering = true;
      this.bufferDepth = depth;
      this.buffer = rhs;
      return;
    }
    this.pushCommand(rhs);
  }

  private consumeBufferedLine(line: string): void {
    this.buffer += " " + line;
    this.bufferDepth += bracketDelta(line);
    if (this.bufferDepth <= 0) this.flushBuffer();
  }

  private flushUnterminatedBuffer(): void {
    if (!this.buffering || !this.buffer) return;
    this.pushCommand(this.buffer);
    this.resetBuffer();
  }

  private flushBuffer(): void {
    this.pushCommand(this.buffer);
    this.resetBuffer();
  }

  private pushCommand(command: string): void {
    this.results.push({ event: this.currentEvent ?? "", command });
  }

  private resetBuffer(): void {
    this.buffering = false;
    this.buffer = "";
    this.bufferDepth = 0;
  }
}

function hookEventFromHeader(line: string): string | null {
  const headerRe = /^\[\[hooks\.([A-Za-z]+)\]\]$/;
  const m = headerRe.exec(line);
  return m ? m[1]! : null;
}

function commandValueFromLine(line: string): string | null {
  const commandRe = /^command\s*=\s*(.+)$/;
  const match = commandRe.exec(line);
  return match?.[1] ?? null;
}

function bracketDelta(value: string): number {
  let depth = 0;
  for (const c of value) {
    if (c === "[") depth++;
    else if (c === "]") depth--;
  }
  return depth;
}

export function codexHooksEnabled(toml: string): boolean {
  const cleaned = stripTomlComments(toml);
  const lines = cleaned.split("\n");
  let inFeatures = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^\[.+\]$/.test(line)) {
      inFeatures = line === "[features]";
      continue;
    }
    if (inFeatures && /^hooks\s*=\s*true\s*$/.test(line)) return true;
  }
  return false;
}

export function enableCodexHooksFeature(toml: string): string {
  if (codexHooksEnabled(toml)) return toml;
  const lines = toml.split("\n");
  const featuresIndex = lines.findIndex((line) => line.trim() === "[features]");
  if (featuresIndex >= 0) {
    let insertAt = featuresIndex + 1;
    while (insertAt < lines.length && !/^\s*\[.+\]\s*$/.test(lines[insertAt]!)) {
      if (/^\s*hooks\s*=/.test(lines[insertAt]!)) {
        lines[insertAt] = "hooks = true";
        return lines.join("\n");
      }
      insertAt++;
    }
    lines.splice(featuresIndex + 1, 0, "hooks = true");
    return lines.join("\n");
  }
  const suffix = toml.trim().length > 0 ? "\n\n" : "";
  return `${toml}${suffix}[features]\nhooks = true\n`;
}

export function normalizeDetectedCommand(command: string): string {
  const trimmed = command.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const parts = [...trimmed.matchAll(/"((?:\\.|[^"])*)"/g)].map((match) => {
      try {
        return JSON.parse(`"${match[1] ?? ""}"`) as string;
      } catch {
        return match[1] ?? "";
      }
    });
    if (parts.length > 0) return parts.join(" ");
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed) as string;
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function tomlString(value: string): string {
  return JSON.stringify(value);
}

export function tomlTableName(line: string): string | null {
  const match = line.match(/^\s*\[([^[\]][^\]]*)\]\s*(?:#.*)?$/);
  return match?.[1]?.trim() ?? null;
}

export function parseTomlQuotedKey(value: string): string | null {
  if (!value.startsWith('"')) return null;
  try {
    return JSON.parse(value) as string;
  } catch {
    return null;
  }
}
