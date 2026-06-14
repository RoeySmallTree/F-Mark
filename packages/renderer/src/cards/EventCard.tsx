/* EventCard — dispatcher that picks the right card component for an event.

   Routing rules (Phase 5 — Cards):
     prose with no name + no target → MessageCard
     prose with name                → ProseCard
     prose with target              → null (rendered as pin inside ProseCard /
                                            as bubble inside RightComments)
     choices                        → ChoicesCard
     choice                         → null (consumed as state inside ChoicesCard)
     html                           → EmbedCard
     todo                           → TodoCard
     file                           → FileCard
     tool-use                       → ToolUseCard
     subagent-run/output            → SubagentCard
     access-request                 → AccessRequestCard
     access-response                → null (consumed by AccessRequestCard)
     turn-end                       → TurnEndDivider
     flow                           → FlowCard
*/

import { type JSX, lazy, Suspense } from "react";
import type {
  AnyEventRecord,
  ForkLinkEventRecord,
  Participant,
  ProsePayload,
  ToolUseEventRecord,
  SubagentOutputEventRecord,
  SubagentRunEventRecord,
} from "@f-mark/shared";
import { getProseRole } from "@f-mark/shared";
import { MessageCard } from "./MessageCard.js";
import { ProseCard } from "./ProseCard.js";
import { ChoicesCard } from "./ChoicesCard.js";
import { EmbedCard } from "./EmbedCard.js";
import { TodoCard } from "./TodoCard.js";
import { FileCard } from "./FileCard.js";
import { ToolUseCard } from "./ToolUseCard.js";
import { SubagentCard } from "./SubagentCard.js";
import { AccessRequestCard } from "./AccessRequestCard.js";
import { TurnEndDivider } from "./TurnEndDivider.js";
import { ForkLinkCard } from "./ForkLinkCard.js";
import { CommentActivityCard } from "./CommentActivityCard.js";
import { FileCommentCard } from "./FileCommentCard.js";
/* FlowCard pulls @xyflow/react (~250 KB) + dagre (~150 KB). Lazy-load so
   the main bundle stays slim — flow events are uncommon and the feed
   already renders incrementally. */
const FlowCard = lazy(() =>
  import("./FlowCard.js").then((m) => ({ default: m.FlowCard })),
);

interface Props {
  event: AnyEventRecord;
  participants: Record<string, Participant>;
  comments: AnyEventRecord[];
  allEvents: AnyEventRecord[];
  /** Filenames of events that are rendered inside an anchor ProseCard
   *  (consumed blocks). Top-level dispatch returns null for these so they
   *  don't show twice. Default `undefined` means "no filter" — keeps
   *  existing tests + call sites green while Feed.tsx threads the real
   *  set in. */
  consumedFilenames?: Set<string>;
  /** Blocks resolved to this anchor's filename — only used when
   *  `event` is a prose anchor and `ProseCard` composes them in. */
  blocks?: AnyEventRecord[];
  /** Per-block comment lookup — threaded into `ProseCard` so each
   *  block's LineCommentRail sees its own comment list. */
  commentsByFilename?: Map<string, AnyEventRecord[]>;
}

export function EventCard({
  event,
  participants,
  comments,
  allEvents,
  consumedFilenames,
  blocks,
  commentsByFilename,
}: Props): JSX.Element | null {
  /* Consumed-block early-out — runs BEFORE the prose-role dispatch so a
     comment-mode prose that's also been resolved to an anchor still
     returns null exactly once. */
  if (
    consumedFilenames !== undefined &&
    consumedFilenames.has(event.filename)
  ) {
    return null;
  }

  /* Orphan signal for non-prose blocks: any non-prose event carrying
     `append_to` whose live anchor isn't in `consumedFilenames` is an
     orphan. Phase 13 polish wires `orphanedAppendTo` through to each card
     variant for the "orphaned embed" badge; today the variants ignore
     the signal, so we don't thread it yet. */

  if (event.kind === "prose") {
    const role = getProseRole(event.payload as ProsePayload);
    if (role.kind === "comment") {
      return (
        <CommentActivityCard
          event={event}
          participants={participants}
          allEvents={allEvents}
        />
      );
    }
    if (role.kind === "file-comment") {
      return (
        <FileCommentCard
          event={event}
          participants={participants}
          allEvents={allEvents}
        />
      );
    }
    if (role.kind === "anchor") {
      return (
        <ProseCard
          event={event}
          participants={participants}
          comments={comments}
          blocks={blocks}
          commentsByFilename={commentsByFilename}
        />
      );
    }
    return (
      <MessageCard
        event={event}
        participants={participants}
        comments={comments}
      />
    );
  }
  if (event.kind === "choices") {
    return (
      <ChoicesCard
        event={event}
        participants={participants}
        allEvents={allEvents}
      />
    );
  }
  if (event.kind === "choice") return null;
  if (event.kind === "html") {
    return (
      <EmbedCard
        event={event}
        participants={participants}
        allEvents={allEvents}
      />
    );
  }
  if (event.kind === "todo") {
    return (
      <TodoCard
        event={event}
        participants={participants}
        allEvents={allEvents}
      />
    );
  }
  if (event.kind === "file") {
    return (
      <FileCard
        event={event}
        participants={participants}
        comments={comments}
      />
    );
  }
  if (event.kind === "tool-use") {
    return <ToolUseCard event={event as ToolUseEventRecord} />;
  }
  if (event.kind === "subagent-run" || event.kind === "subagent-output") {
    return (
      <SubagentCard
        event={event as SubagentRunEventRecord | SubagentOutputEventRecord}
      />
    );
  }
  if (event.kind === "access-request") {
    return (
      <AccessRequestCard
        event={event}
        participants={participants}
        allEvents={allEvents}
      />
    );
  }
  if (event.kind === "access-response") return null;
  if (event.kind === "turn-end") {
    return <TurnEndDivider event={event} participants={participants} />;
  }
  if (event.kind === "flow") {
    return (
      <Suspense fallback={<div className="flow-card" data-event-kind="flow" />}>
        <FlowCard event={event} participants={participants} />
      </Suspense>
    );
  }
  if (event.kind === "fork-link") {
    return <ForkLinkCard event={event as ForkLinkEventRecord} />;
  }
  return null;
}
