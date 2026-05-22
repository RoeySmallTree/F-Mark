/* ProseCard — substantial named-prose card with title, frontmatter pointers,
   rendered markdown body, comment pins in the right gutter, and a foot
   toolbar that toggles rendered / source / accordion modes.

   The pin position math is approximate: we multiply the comment's target
   line number by the prose-content line-height (~25px). Phase 14 will
   replace this with line-precision DOM measurement.
*/

import { useState, type JSX } from "react";
import { FileText, MoreHorizontal } from "lucide-react";
import type {
  AnyEventRecord,
  Participant,
  ProsePayload,
} from "@f-mark/shared";
import { MarkdownRenderer, type MarkdownMode } from "../render/MarkdownRenderer.js";
import { useStore } from "../state/store.js";
import { copyToClipboard } from "../render/copy.js";
import { formatWhen, whoOf } from "./format.js";

interface Props {
  event: AnyEventRecord;
  participants: Record<string, Participant>;
  comments: AnyEventRecord[];
}

const LINE_PX = 25; // matches prose-content font-size:15.5px * line-height:1.6.

export function ProseCard({
  event,
  participants,
  comments,
}: Props): JSX.Element {
  const payload = event.payload as ProsePayload;
  const who = whoOf(event.participant_id, participants);
  const [mode, setMode] = useState<MarkdownMode>("rendered");
  const commentTarget = useStore((s) => s.commentTarget);
  const setCommentTarget = useStore((s) => s.setCommentTarget);

  const isFocused =
    commentTarget !== null && commentTarget.file === event.filename;
  const classes = [
    "prose-card",
    who.isUser ? "user" : "agent",
    isFocused ? "focused" : "",
  ]
    .filter((c) => c.length > 0)
    .join(" ");

  function togglePin(file: string, lines?: [number, number]): void {
    const active =
      commentTarget !== null &&
      commentTarget.file === file &&
      (commentTarget.lines?.[0] ?? null) === (lines?.[0] ?? null);
    if (active) {
      setCommentTarget(null);
    } else {
      setCommentTarget({ file, lines });
    }
  }

  function pinTop(lines: [number, number] | undefined): number {
    const line = lines?.[0] ?? 1;
    return LINE_PX * line - 4;
  }

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

  return (
    <article className={classes} data-event-kind="prose-named">
      <div className="prose-head">
        <span className="stripe-dot" aria-hidden />
        <span className="who">{who.name}</span>
        <span className="when">{formatWhen(event.timestamp)}</span>
        <span className="badge">
          <FileText size={10} aria-hidden /> NAMED
        </span>
        <button
          type="button"
          className="menu"
          aria-label="Quick-copy contribution"
          title="Copy contribution as markdown"
          onClick={() => void onCopy()}
        >
          <MoreHorizontal size={14} aria-hidden />
        </button>
      </div>
      <div className={`prose-body${who.isUser ? " user" : ""}`}>
        <h1 className="prose-title">{payload.name ?? "Untitled"}</h1>
        {frontmatterEntries.length > 0 && (
          <div className="prose-frontmatter">
            {frontmatterEntries.map(([k, v]) => (
              <span key={k}>
                <b>{k}:</b> {v}
              </span>
            ))}
          </div>
        )}
        <div className="prose-content">
          <MarkdownRenderer content={payload.content} mode={mode} />
        </div>
        {comments.map((c) => {
          const lines = (c.payload as ProsePayload).target?.lines;
          const active =
            commentTarget !== null &&
            commentTarget.file === event.filename &&
            (commentTarget.lines?.[0] ?? null) === (lines?.[0] ?? null);
          return (
            <button
              key={c.filename}
              type="button"
              className={["prose-pin", active ? "active" : ""].join(" ").trim()}
              style={{ top: `${pinTop(lines)}px` }}
              onClick={() => togglePin(event.filename, lines)}
              aria-label={`Comment by ${c.participant_id}`}
              data-target-line={lines?.[0] ?? 1}
            >
              <span className="dot" aria-hidden />1
            </button>
          );
        })}
      </div>
      <div className="prose-foot">
        <button type="button" onClick={() => void onCopy()}>
          Copy as markdown
        </button>
        <button
          type="button"
          className={mode === "source" ? "active" : ""}
          onClick={() =>
            setMode((m) => (m === "source" ? "rendered" : "source"))
          }
        >
          View source
        </button>
        <button
          type="button"
          className={mode === "accordion" ? "active" : ""}
          onClick={() =>
            setMode((m) => (m === "accordion" ? "rendered" : "accordion"))
          }
        >
          View accordion
        </button>
        <span className="spacer" />
        <span className="ver">
          {wordCount(payload.content)} words
        </span>
      </div>
    </article>
  );
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}
