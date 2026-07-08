import type {
  AnyEventRecord,
  Participant,
  ProsePayload,
} from "@f-mark/shared";
import type { CommentTarget } from "../../state/store.js";
import { whoOf } from "../format.js";

const NO_LOOSE_STRING_VALUES = {
  untitled: "Untitled",
  proseCard: "prose-card",
  user: "user",
  agent: "agent",
  focused: "focused",
  supersedes: "supersedes",
  prose: "prose",
  event: "event",
} as const;

export type ProseFrontmatterEntry = readonly [label: string, value: string];

export class ProseCardModel {
  readonly payload: ProsePayload;
  readonly who: ReturnType<typeof whoOf>;

  constructor(
    readonly event: AnyEventRecord,
    readonly participants: Record<string, Participant>,
    readonly comments: AnyEventRecord[],
    readonly blocks: AnyEventRecord[],
    readonly commentsByFilename: Map<string, AnyEventRecord[]> | undefined,
    private readonly commentTarget: CommentTarget | null,
  ) {
    this.payload = event.payload as ProsePayload;
    this.who = whoOf(event.participant_id, participants);
  }

  get proseName(): string {
    return this.payload.name ?? NO_LOOSE_STRING_VALUES.untitled;
  }

  get hasLegacyContent(): boolean {
    return this.payload.content.trim().length > 0;
  }

  get isTrulyEmpty(): boolean {
    return !this.hasLegacyContent && this.blocks.length === 0;
  }

  get wordTotal(): number {
    return wordCount(this.payload.content) + this.blockWordTotal();
  }

  get classes(): string {
    return [
      NO_LOOSE_STRING_VALUES.proseCard,
      this.who.isUser ? NO_LOOSE_STRING_VALUES.user : NO_LOOSE_STRING_VALUES.agent,
      this.isFocused ? NO_LOOSE_STRING_VALUES.focused : "",
    ]
      .filter((className) => className.length > 0)
      .join(" ");
  }

  get frontmatterEntries(): ProseFrontmatterEntry[] {
    return [
      this.frontmatterEntry("in reply to", this.payload.in_reply_to),
      this.frontmatterEntry(NO_LOOSE_STRING_VALUES.supersedes, this.payload.supersedes),
    ].filter((entry): entry is ProseFrontmatterEntry => entry !== null);
  }

  legacyBlock(): AnyEventRecord {
    return {
      filename: this.event.filename,
      timestamp: this.event.timestamp,
      participant_id: this.event.participant_id,
      kind: NO_LOOSE_STRING_VALUES.prose,
      payload: { content: this.payload.content } as ProsePayload,
    };
  }

  commentsForBlock(filename: string): AnyEventRecord[] {
    return this.commentsByFilename?.get(filename) ?? [];
  }

  private get isFocused(): boolean {
    const target = this.commentTarget;
    return (
      target !== null &&
      target.kind === NO_LOOSE_STRING_VALUES.event &&
      (target.file === this.event.filename ||
        this.blocks.some((block) => block.filename === target.file))
    );
  }

  private blockWordTotal(): number {
    return this.blocks.reduce((sum, block) => {
      if (block.kind !== NO_LOOSE_STRING_VALUES.prose) return sum;
      return sum + wordCount((block.payload as ProsePayload).content);
    }, 0);
  }

  private frontmatterEntry(
    label: string,
    value: unknown,
  ): ProseFrontmatterEntry | null {
    return typeof value === "string" && value.length > 0
      ? [label, value]
      : null;
  }
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}
