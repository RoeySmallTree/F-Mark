/* ProseInlineBlock — registry dispatcher for embedded blocks inside a
   ProseCard. Each kind has its own inline renderer; in Phase 6 every
   renderer is a stub placeholder. Phases 7+ replace each stub with the
   real embedded variant of the corresponding top-level card.

   The outer `.prose-embed-frame` wrapper carries
   `data-event-filename` + `data-block-kind` so right-panel comment focus
   (RightComments scrolls to `[data-event-filename]`) still resolves to
   embedded blocks (see plan.md ProseInlineBlock section, review_2
   finding C). */

import { type FC, type JSX } from "react";
import type {
  AnyEventRecord,
  EventKind,
  Participant,
  ProsePayload,
} from "@f-mark/shared";
import { type MarkdownMode } from "../render/MarkdownRenderer.js";
import { LineCommentRail } from "./LineCommentRail.js";
import { FlowCard } from "./FlowCard.js";

export interface InlineProps {
  event: AnyEventRecord;
  participants: Record<string, Participant>;
  comments: AnyEventRecord[];
  mode: MarkdownMode;
}

function StubBlock({ kind }: { kind: string }): JSX.Element {
  return (
    <div className="prose-embed-stub">{kind} block — TODO</div>
  );
}

/* Real prose-block renderer. Renders the block's markdown content via
   `LineCommentRail` (which wraps `MarkdownRenderer`) so line-level
   comments work per-block. If the block has its own `name`, render
   it as a sub-section header (h3) above the content. */
const InlineProseBlock: FC<InlineProps> = ({
  event,
  participants,
  comments,
  mode,
}) => {
  const payload = event.payload as ProsePayload;
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  return (
    <div className="prose-inline-prose">
      {name.length > 0 && (
        <h3 className="prose-block-name">{name}</h3>
      )}
      <LineCommentRail
        event={event}
        content={payload.content}
        comments={comments}
        participants={participants}
        mode={mode}
        className="prose-block-content"
        lineHeight={25}
      />
    </div>
  );
};
const InlineFlowBlock: FC<InlineProps> = ({ event, participants }) => (
  <FlowCard event={event} participants={participants} variant="embedded" />
);
const InlineFileBlock: FC<InlineProps> = ({ event }) => (
  <StubBlock kind={event.kind} />
);
const InlineHtmlBlock: FC<InlineProps> = ({ event }) => (
  <StubBlock kind={event.kind} />
);
const InlineChoicesBlock: FC<InlineProps> = ({ event }) => (
  <StubBlock kind={event.kind} />
);
const InlineTodoBlock: FC<InlineProps> = ({ event }) => (
  <StubBlock kind={event.kind} />
);
const InlineToolUseBlock: FC<InlineProps> = ({ event }) => (
  <StubBlock kind={event.kind} />
);

const INLINE_RENDERERS: Partial<Record<EventKind, FC<InlineProps>>> = {
  prose: InlineProseBlock,
  flow: InlineFlowBlock,
  file: InlineFileBlock,
  html: InlineHtmlBlock,
  choices: InlineChoicesBlock,
  todo: InlineTodoBlock,
  "tool-use": InlineToolUseBlock,
};

function UnsupportedBlock({ event }: { event: AnyEventRecord }): JSX.Element {
  return (
    <div className="prose-embed-stub" data-unsupported>
      unsupported block kind: {event.kind}
    </div>
  );
}

export function ProseInlineBlock(props: InlineProps): JSX.Element {
  const Renderer = INLINE_RENDERERS[props.event.kind];
  return (
    <div
      className="prose-embed-frame"
      data-block-kind={props.event.kind}
      data-event-filename={props.event.filename}
    >
      {Renderer === undefined ? (
        <UnsupportedBlock event={props.event} />
      ) : (
        <Renderer {...props} />
      )}
    </div>
  );
}
