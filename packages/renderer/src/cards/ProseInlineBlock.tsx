/* ProseInlineBlock — registry dispatcher for embedded blocks inside a
   ProseCard. Each kind has its own inline renderer; in Phase 6 every
   renderer is a stub placeholder. Phases 7+ replace each stub with the
   real embedded variant of the corresponding top-level card.

   The outer `.prose-embed-frame` wrapper carries
   `data-event-filename` + `data-block-kind` so right-panel comment focus
   (RightComments scrolls to `[data-event-filename]`) still resolves to
   embedded blocks (see plan.md ProseInlineBlock section, review_2
   finding C). */

import { type FC, type JSX, lazy, Suspense } from "react";
import type {
  AnyEventRecord,
  EventKind,
  FlowPayload,
  Participant,
  ProsePayload,
  SubagentOutputEventRecord,
  SubagentRunEventRecord,
  ToolUseEventRecord,
} from "@f-mark/shared";
import { type MarkdownMode } from "../render/MarkdownRenderer.js";
import { LineCommentRail } from "./LineCommentRail.js";
/* Lazy — see EventCard.tsx for rationale (keeps @xyflow + dagre out of
   the main chunk). */
const FlowCard = lazy(() =>
  import("./FlowCard.js").then((m) => ({ default: m.FlowCard })),
);
import { EmbedCard } from "./EmbedCard.js";
import { FileCard } from "./FileCard.js";
import { ChoicesCard } from "./ChoicesCard.js";
import { TodoCard } from "./TodoCard.js";
import { ToolUseCard } from "./ToolUseCard.js";
import { SubagentCard } from "./SubagentCard.js";

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

function flowFallbackTitle(event: AnyEventRecord): string {
  const payload = event.payload as Partial<FlowPayload>;
  if (typeof payload.title === "string" && payload.title.length > 0) {
    return payload.title;
  }
  return typeof payload.id === "string" ? payload.id : "";
}

function FlowCardFallback({ event }: { event: AnyEventRecord }): JSX.Element {
  const title = flowFallbackTitle(event);
  return (
    <div className="flow-card flow-card-embedded" data-event-kind="flow">
      {title.length > 0 ? <div className="flow-title">{title}</div> : null}
      <div className="flow-canvas" aria-hidden />
    </div>
  );
}

const InlineFlowBlock: FC<InlineProps> = ({ event, participants }) => (
  <Suspense fallback={<FlowCardFallback event={event} />}>
    <FlowCard event={event} participants={participants} variant="embedded" />
  </Suspense>
);
const InlineFileBlock: FC<InlineProps> = ({ event, participants, comments }) => (
  <FileCard event={event} participants={participants} comments={comments} />
);
const InlineHtmlBlock: FC<InlineProps> = ({ event, participants }) => (
  <EmbedCard
    event={event}
    participants={participants}
    allEvents={[event]}
    variant="embedded"
  />
);
const InlineChoicesBlock: FC<InlineProps> = ({ event, participants }) => (
  <ChoicesCard
    event={event}
    participants={participants}
    allEvents={[event]}
    variant="embedded"
  />
);
const InlineTodoBlock: FC<InlineProps> = ({ event, participants }) => (
  <TodoCard event={event} participants={participants} variant="embedded" />
);
const InlineToolUseBlock: FC<InlineProps> = ({ event }) => (
  <ToolUseCard event={event as ToolUseEventRecord} />
);
const InlineSubagentBlock: FC<InlineProps> = ({ event }) => (
  <SubagentCard
    event={event as SubagentRunEventRecord | SubagentOutputEventRecord}
  />
);

const INLINE_RENDERERS: Partial<Record<EventKind, FC<InlineProps>>> = {
  prose: InlineProseBlock,
  flow: InlineFlowBlock,
  file: InlineFileBlock,
  html: InlineHtmlBlock,
  choices: InlineChoicesBlock,
  todo: InlineTodoBlock,
  "tool-use": InlineToolUseBlock,
  "subagent-run": InlineSubagentBlock,
  "subagent-output": InlineSubagentBlock,
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
