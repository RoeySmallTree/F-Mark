export class MarkdownDocument {
  private readonly lines: string[] = [];

  line(value = ""): this {
    this.lines.push(value);
    return this;
  }

  table(headers: string[], rows: string[][]): this {
    this.lines.push(formatMarkdownTable(headers, rows));
    return this;
  }

  codeFence(lang: string, code: string): this {
    this.lines.push(formatFence(lang, code));
    return this;
  }

  toString(): string {
    return this.lines.join("\n");
  }
}

function formatMarkdownTable(
  headers: string[],
  rows: string[][],
): string {
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
  return `${head}\n${sep}\n${body}`;
}

function formatFence(lang: string, code: string): string {
  return ["```" + lang, code, "```"].join("\n");
}
