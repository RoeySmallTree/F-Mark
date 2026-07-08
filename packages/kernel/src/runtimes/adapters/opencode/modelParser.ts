import type { VerboseEntry } from "./types.js";

class VerboseModelsParser {
  private readonly lines: string[];
  private index = 0;
  private entries: VerboseEntry[] = [];

  constructor(stdout: string) {
    this.lines = stdout.split("\n");
  }

  parse(): VerboseEntry[] {
    while (this.index < this.lines.length) {
      this.parseCurrentLine();
    }
    return this.entries;
  }

  private parseCurrentLine(): void {
    const id = this.currentModelId();
    if (id === undefined) {
      this.index++;
      return;
    }

    const jsonStart = this.nextJsonStart(this.index + 1);
    if (jsonStart === undefined) {
      this.index++;
      return;
    }

    const block = this.readJsonBlock(jsonStart);
    if (block === undefined) {
      this.index++;
      return;
    }

    this.addEntry(id, block.text);
    this.index = block.nextIndex;
  }

  private currentModelId(): string | undefined {
    const trimmed = (this.lines[this.index] ?? "").trim();
    return /^\S+\/\S+$/.test(trimmed) ? trimmed : undefined;
  }

  private nextJsonStart(start: number): number | undefined {
    let cursor = start;
    while (cursor < this.lines.length && (this.lines[cursor] ?? "").trim() === "") {
      cursor++;
    }
    const first = (this.lines[cursor] ?? "").trim();
    return first.startsWith("{") ? cursor : undefined;
  }

  private readJsonBlock(
    start: number,
  ): { text: string; nextIndex: number } | undefined {
    const scanner = new JsonBlockScanner();
    const buffer: string[] = [];

    for (let cursor = start; cursor < this.lines.length; cursor++) {
      const line = this.lines[cursor] ?? "";
      buffer.push(line);
      scanner.scanLine(line);
      if (scanner.isComplete()) {
        return { text: buffer.join("\n"), nextIndex: cursor + 1 };
      }
    }
    return undefined;
  }

  private addEntry(id: string, jsonText: string): void {
    try {
      this.entries.push({ id, json: JSON.parse(jsonText) });
    } catch {
      // Malformed model blocks are ignored; later blocks can still parse.
    }
  }
}

class JsonBlockScanner {
  private depth = 0;
  private inString = false;
  private escape = false;

  scanLine(line: string): void {
    for (const character of line) {
      this.scanCharacter(character);
    }
  }

  isComplete(): boolean {
    return this.depth === 0;
  }

  private scanCharacter(character: string): void {
    if (this.consumeEscape()) return;
    if (this.beginEscape(character)) return;
    if (this.toggleString(character)) return;
    if (this.inString) return;
    this.scanBrace(character);
  }

  private consumeEscape(): boolean {
    if (!this.escape) return false;
    this.escape = false;
    return true;
  }

  private beginEscape(character: string): boolean {
    if (!this.inString || character !== "\\") return false;
    this.escape = true;
    return true;
  }

  private toggleString(character: string): boolean {
    if (character !== '"') return false;
    this.inString = !this.inString;
    return true;
  }

  private scanBrace(character: string): void {
    if (character === "{") this.depth++;
    else if (character === "}") this.depth--;
  }
}

/* Parses the `opencode models --verbose` stdout: interleaved
   "provider/model\n{multi-line JSON}\n" blocks. Brace-balanced, string-aware. */
export function parseModelsVerbose(stdout: string): VerboseEntry[] {
  return new VerboseModelsParser(stdout).parse();
}
