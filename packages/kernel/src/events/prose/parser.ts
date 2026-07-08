import type { ProsePayload, ProseFrontmatter } from "@f-mark/shared";
import { isLineRange, isMention } from "./guards.js";
import { lineContextFromFrontmatter } from "./lineContext.js";
import { copyDefinedStringFields, normalizeSupersedes } from "./stringFields.js";

export class ProseFrontmatterParser {
  private readonly out: ProsePayload;

  constructor(private readonly data: Partial<ProseFrontmatter>, content: string) {
    this.out = { content };
  }

  parse(): ProsePayload {
    copyDefinedStringFields(this.data, this.out);
    this.readSupersedes();
    this.readMode();
    this.readLineRange();
    this.readLineContext();
    this.readBooleanFlags();
    this.readMentions();
    this.readSource();
    return this.out;
  }

  private readSupersedes(): void {
    const supersedes = normalizeSupersedes(this.data.supersedes);
    if (supersedes !== undefined) this.out.supersedes = supersedes;
  }

  private readMode(): void {
    if (this.data.mode === "content" || this.data.mode === "comment") {
      this.out.mode = this.data.mode;
    }
  }

  private readLineRange(): void {
    if (isLineRange(this.data.lines)) this.out.lines = this.data.lines;
  }

  private readLineContext(): void {
    const lineContext = lineContextFromFrontmatter(this.data.line_context);
    if (lineContext !== undefined) this.out.line_context = lineContext;
  }

  private readBooleanFlags(): void {
    if (this.data.removed === true) this.out.removed = true;
    if (this.data.arbitrary === true) this.out.arbitrary = true;
  }

  private readMentions(): void {
    if (!Array.isArray(this.data.mentions)) return;
    const mentions = this.data.mentions.filter(isMention);
    if (mentions.length > 0) this.out.mentions = mentions;
  }

  private readSource(): void {
    if (
      this.data.source === "mcp" ||
      this.data.source === "hook" ||
      this.data.source === "manual"
    ) {
      this.out.source = this.data.source;
    }
  }
}
