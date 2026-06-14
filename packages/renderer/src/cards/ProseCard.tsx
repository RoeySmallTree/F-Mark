/* ProseCard — named-prose card. The head holds the prose name (accent-coloured
   left) and a meta cluster (word count • view toggle • copy) on the right,
   with a small caption row underneath for participant + timestamp.
   The body renders frontmatter pointers, markdown content (rendered or
   accordion mode), and a right-side line comment rail.
*/

import { useState, type JSX } from "react";
import { AlignLeft, Copy, Rows3 } from "lucide-react";
import type {
  AnyEventRecord,
  Participant,
  ProsePayload,
} from "@f-mark/shared";
import { type MarkdownMode } from "../render/MarkdownRenderer.js";
import { useStore } from "../state/store.js";
import { copyToClipboard } from "../render/copy.js";
import { formatWhen, whoOf } from "./format.js";
import { ProseInlineBlock } from "./ProseInlineBlock.js";
import { ProseEmptyState } from "./ProseEmptyState.js";
import { BlockAccordion } from "../render/BlockAccordion.js";

interface Props {
  event: AnyEventRecord;
  participants: Record<string, Participant>;
  comments: AnyEventRecord[];
  /** Blocks appended to this anchor via `append_to`. Already sorted by
   *  root-filename slot order in the aggregate. Phase 6+ renders these
   *  inline beneath the anchor head as `ProseInlineBlock` stubs. */
  blocks?: AnyEventRecord[];
  /** Per-block comment lookup. Phase 7 routes line-comments on individual
   *  blocks to each block's own LineCommentRail. */
  commentsByFilename?: Map<string, AnyEventRecord[]>;
}

export function ProseCard({
  event,
  participants,
  comments,
  blocks = [],
  commentsByFilename,
}: Props): JSX.Element {
  const payload = event.payload as ProsePayload;
  const who = whoOf(event.participant_id, participants);
  const [mode, setMode] = useState<MarkdownMode>("rendered");
  const commentTarget = useStore((s) => s.commentTarget);
  const hasLegacyContent = payload.content.trim().length > 0;
  const isTrulyEmpty = !hasLegacyContent && blocks.length === 0;
  /* Word count = sum across the anchor's own (legacy) content + every
     prose block. Non-prose blocks don't contribute. Bug fix (sonnet QA
     pass 1, BUG-2): anchors are header-only so without this we'd always
     show "0 words" for composed docs. */
  const words =
    wordCount(payload.content) +
    blocks.reduce((sum, b) => {
      if (b.kind !== "prose") return sum;
      const bp = b.payload as ProsePayload;
      return sum + wordCount(bp.content);
    }, 0);

  /* Focus matches either the anchor itself OR any of its appended blocks —
     LineCommentRail uses the block's own filename for comments on appended
     blocks, but the surrounding ProseCard must still escape the feed's
     `.dimmed` opacity so the block being commented on stays readable. */
  const isFocused =
    commentTarget !== null &&
    commentTarget.kind === "event" &&
    (commentTarget.file === event.filename ||
      blocks.some((b) => b.filename === commentTarget.file));
  const classes = [
    "prose-card",
    who.isUser ? "user" : "agent",
    isFocused ? "focused" : "",
  ]
    .filter((c) => c.length > 0)
    .join(" ");

  const frontmatterEntries: [string, string][] = [];
  if (typeof payload.in_reply_to === "string" && payload.in_reply_to.length > 0) {
    frontmatterEntries.push(["in reply to", payload.in_reply_to]);
  }
  if (typeof payload.supersedes === "string" && payload.supersedes.length > 0) {
    frontmatterEntries.push(["supersedes", payload.supersedes]);
  }

  async function onCopy(): Promise<void> {
    await copyToClipboard(payload.content);
  }

  const proseName = payload.name ?? "Untitled";

  return (
    <article className={classes} data-event-kind="prose-named">
      <header className="prose-head">
        <div className="prose-title-row">
          <h2 className="prose-title-name" title={proseName}>
            {proseName}
          </h2>
          <div className="prose-meta">
            <span className="prose-meta-item prose-meta-words">
              {words} {words === 1 ? "word" : "words"}
            </span>
            <div
              className="prose-toggle"
              role="group"
              aria-label="Markdown view mode"
            >
              <button
                type="button"
                className={mode === "rendered" ? "on" : ""}
                onClick={() => setMode("rendered")}
                aria-label="Rendered view"
                aria-pressed={mode === "rendered"}
                title="Rendered"
              >
                <AlignLeft size={13} aria-hidden />
              </button>
              <button
                type="button"
                className={mode === "accordion" ? "on" : ""}
                onClick={() => setMode("accordion")}
                aria-label="Accordion view"
                aria-pressed={mode === "accordion"}
                title="Accordion"
              >
                <Rows3 size={13} aria-hidden />
              </button>
            </div>
            <button
              type="button"
              className="prose-copy-btn"
              onClick={() => void onCopy()}
              aria-label="Copy as markdown"
              title="Copy as markdown"
            >
              <Copy size={13} aria-hidden />
            </button>
          </div>
        </div>
        <div className="prose-caption">
          <span className="prose-caption-who">{who.name}</span>
          <span className="prose-caption-when">
            {formatWhen(event.timestamp)}
          </span>
        </div>
      </header>
      <div className={`prose-body${who.isUser ? " user" : ""}`}>
        {frontmatterEntries.length > 0 && (
          <div className="prose-frontmatter">
            {frontmatterEntries.map(([k, v]) => (
              <span key={k}>
                <b>{k}:</b> {v}
              </span>
            ))}
          </div>
        )}
        {mode === "accordion" ? (
          <BlockAccordion
            blocks={blocks}
            participants={participants}
            commentsByFilename={commentsByFilename}
            legacyBlock={
              hasLegacyContent
                ? syntheticLegacyBlock(event, payload)
                : undefined
            }
            legacyComments={comments}
          />
        ) : (
          <>
            {hasLegacyContent && (
              <ProseInlineBlock
                event={syntheticLegacyBlock(event, payload)}
                participants={participants}
                comments={comments}
                mode={mode}
              />
            )}
            {blocks.map((b) => (
              <ProseInlineBlock
                key={b.filename}
                event={b}
                participants={participants}
                comments={commentsByFilename?.get(b.filename) ?? []}
                mode={mode}
              />
            ))}
          </>
        )}
        {isTrulyEmpty && <ProseEmptyState />}
      </div>
    </article>
  );
}

/* Build a synthetic block event for the anchor's own legacy content.
   Phase 6 stub renders this as a "prose block — TODO" placeholder;
   Phase 13 polish swaps in a LegacyContentMarker. Uses the anchor's
   filename as its key so right-panel comment focus continues to scroll
   to the anchor card (matches the LineCommentRail target). */
function syntheticLegacyBlock(
  anchor: AnyEventRecord,
  payload: ProsePayload,
): AnyEventRecord {
  return {
    filename: anchor.filename,
    timestamp: anchor.timestamp,
    participant_id: anchor.participant_id,
    kind: "prose",
    payload: { content: payload.content } as ProsePayload,
  };
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}
