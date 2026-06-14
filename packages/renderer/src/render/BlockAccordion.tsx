/* BlockAccordion — renders an anchor's blocks as a folded list.
   Each block becomes one fold; the fold's title comes from the block's
   `name` (prose) or a kind-default; the body uses the same inline
   renderer registry as the rendered view (ProseInlineBlock).
   See plan.md "Accordion mode" section.

   Phase 12: all folds open by default; clicking the chevron toggles.
   Nesting (block whose own children are blocks) is intentionally left
   for a follow-up — Phase 6's aggregate gives us a flat blocks-by-anchor
   map; sub-block resolution would need a recursive pass. */

import { useState, type JSX } from "react";
import { ChevronRight } from "lucide-react";
import type {
  AnyEventRecord,
  EventKind,
  Participant,
  ProsePayload,
} from "@f-mark/shared";
import { type MarkdownMode } from "./MarkdownRenderer.js";
import { ProseInlineBlock } from "../cards/ProseInlineBlock.js";

interface Props {
  blocks: AnyEventRecord[];
  participants: Record<string, Participant>;
  /** Lookup of per-block comments. Each block's fold mounts the same
   *  inline renderer as the rendered view; the renderer passes the
   *  block's comment slice through to LineCommentRail. */
  commentsByFilename?: Map<string, AnyEventRecord[]>;
  /** Optional synthetic legacy block to render as the first fold. */
  legacyBlock?: AnyEventRecord;
  /** Comments for the legacy synthetic block (anchor's own comments). */
  legacyComments?: AnyEventRecord[];
  className?: string;
}

const KIND_DEFAULT_LABEL: Record<EventKind, string> = {
  prose: "Section",
  flow: "Flow chart",
  file: "File",
  html: "Embed",
  choices: "Choices",
  todo: "Todo",
  "tool-use": "Tool use",
  "subagent-run": "Sub-agent run",
  "subagent-output": "Sub-agent output",
  "turn-end": "Turn end",
  choice: "Choice",
  "access-request": "Access request",
  "access-response": "Access response",
  "fork-link": "Fork link",
};

function blockLabel(
  event: AnyEventRecord,
  perKindCounter: Map<EventKind, number>,
): string {
  if (event.kind === "prose") {
    const name = (event.payload as ProsePayload).name?.trim();
    if (name !== undefined && name.length > 0) return name;
  }
  const seen = (perKindCounter.get(event.kind) ?? 0) + 1;
  perKindCounter.set(event.kind, seen);
  return `${KIND_DEFAULT_LABEL[event.kind] ?? event.kind} ${seen}`;
}

interface FoldProps {
  event: AnyEventRecord;
  title: string;
  participants: Record<string, Participant>;
  comments: AnyEventRecord[];
  initiallyOpen: boolean;
}

function Fold({
  event,
  title,
  participants,
  comments,
  initiallyOpen,
}: FoldProps): JSX.Element {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <div
      className={`fm-accordion-section${open ? " open" : ""}`}
      data-block-fold-kind={event.kind}
    >
      <button
        type="button"
        className="fm-accordion-h1"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className={`fm-accordion-chevron${open ? " fm-accordion-chevron-open" : ""}`}
          aria-hidden
        >
          <ChevronRight size={14} aria-hidden />
        </span>
        <span className="fm-accordion-title">{title}</span>
        <span className="fm-accordion-chip">{event.kind}</span>
      </button>
      {open && (
        <div className="fm-accordion-body">
          {/* The inline renderer here intentionally re-mounts on
              open/close (cheap for prose, costlier for flow). Lazy
              mounting is the v1 perf strategy. */}
          <ProseInlineBlock
            event={event}
            participants={participants}
            comments={comments}
            mode={"rendered" as MarkdownMode}
          />
        </div>
      )}
    </div>
  );
}

export function BlockAccordion({
  blocks,
  participants,
  commentsByFilename,
  legacyBlock,
  legacyComments,
  className,
}: Props): JSX.Element {
  /* Per-kind sequence numbers used to label unnamed blocks. We compute
     labels in render order so "Section 2" stays "Section 2" across re-
     renders for the same blocks array. */
  const counter = new Map<EventKind, number>();
  const cls = "fm-accordion fm-block-accordion" + (className ? " " + className : "");
  const folds: { event: AnyEventRecord; title: string; comments: AnyEventRecord[] }[] = [];

  if (legacyBlock !== undefined) {
    folds.push({
      event: legacyBlock,
      title: "Legacy content",
      comments: legacyComments ?? [],
    });
  }
  for (const b of blocks) {
    folds.push({
      event: b,
      title: blockLabel(b, counter),
      comments: commentsByFilename?.get(b.filename) ?? [],
    });
  }

  return (
    <div className={cls}>
      <div className="fm-accordion-sections">
        {folds.map((f) => (
          <Fold
            key={f.event.filename + f.title}
            event={f.event}
            title={f.title}
            participants={participants}
            comments={f.comments}
            initiallyOpen
          />
        ))}
      </div>
    </div>
  );
}
