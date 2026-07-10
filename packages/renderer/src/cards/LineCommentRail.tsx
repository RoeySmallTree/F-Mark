import { useCallback, useMemo, type JSX } from "react";
import type {
  AnyEventRecord,
  Participant,
  ProsePayload,
} from "@f-mark/shared";
import { type MarkdownMode } from "../render/MarkdownRenderer.js";
import { InlineCommentThreadPopover } from "../components/lineCommentPopover/InlineCommentThreadPopover.js";
import { targetKey } from "../panels/right/comments/commentModel.js";
import { quoteFromEventTarget } from "../comments/commentQuote.js";
import {
  currentCommentWho,
  defaultLineCommentMentions,
} from "./lineCommentRail/defaultMentions.js";
import { LineCommentContent } from "./lineCommentRail/LineCommentContent.js";
import {
  DraftCommentMarkers,
  DraftLineNumbers,
  ExistingCommentMarkers,
} from "./lineCommentRail/LineCommentMarkers.js";
import { LineCommentPopoverHost } from "./lineCommentRail/LineCommentPopoverHost.js";
import { highlightLinesForTarget, targetFrom } from "./lineCommentRail/commentTargets.js";
import { useSyncInlineCommentThread } from "./lineCommentRail/useSyncInlineCommentThread.js";
import { useExistingCommentLayouts } from "./lineCommentRail/useExistingCommentLayouts.js";
import { useInlineThreadPopover } from "./lineCommentRail/useInlineThreadPopover.js";
import { useLineCommentController } from "./lineCommentRail/useLineCommentController.js";
import { useLineCommentSubmit } from "./lineCommentRail/useLineCommentSubmit.js";
import { useLineCommentStoreState } from "./lineCommentRail/useLineCommentStoreState.js";
import type { LineRange } from "./lineCommentRail/lineGeometry.js";

const NO_LOOSE_STRING_VALUES = {
  rendered: "rendered",
  event: "event",
} as const;

interface Props {
  event: AnyEventRecord;
  content: string;
  comments: AnyEventRecord[];
  participants: Record<string, Participant>;
  mode?: MarkdownMode;
  className?: string;
  lineHeight?: number;
  revealWords?: boolean;
}

function titleForEvent(event: AnyEventRecord, content: string): string {
  const payload = event.payload as ProsePayload;
  if (typeof payload.name === "string" && payload.name.trim().length > 0) {
    return payload.name.trim();
  }
  const preview = content.split(/\r?\n/).find((line) => line.trim().length > 0);
  return preview?.trim().slice(0, 44) ?? event.filename;
}

export function LineCommentRail({
  event,
  content,
  comments,
  participants,
  mode = NO_LOOSE_STRING_VALUES.rendered,
  className,
  lineHeight = 25,
  revealWords = false,
}: Props): JSX.Element {
  const store = useLineCommentStoreState();
  const documentTitle = titleForEvent(event, content);

  const defaultMentions = useMemo(
    () =>
      defaultLineCommentMentions({
        participants,
        authorId: event.participant_id,
        currentSessionId: store.currentSessionId,
      }),
    [participants, event.participant_id, store.currentSessionId],
  );
  const currentWho = currentCommentWho(store.currentUserId, participants);
  const rail = useLineCommentController({
    content,
    mode,
    lineHeight,
    defaultMentions,
  });
  const thread = useInlineThreadPopover({
    lineBoxes: rail.lineBoxes,
    lineHeight,
  });

  const highlightLines = highlightLinesForTarget(
    store.activeTarget,
    event.filename,
    rail.lineCount,
  );

  const existingMarkerLayouts = useExistingCommentLayouts({
    comments,
    participants,
    lineCount: rail.lineCount,
    lineHeight,
    lineBoxes: rail.lineBoxes,
  });
  const { busy, submitComment } = useLineCommentSubmit({
    activePath: store.activePath,
    activePathId: store.activePathId,
    currentSessionId: store.currentSessionId,
    currentUserId: store.currentUserId,
    event,
    participants,
    selectedMentions: rail.selectedMentions,
    sessions: store.sessions,
    token: store.token,
    clearSavedDraft: rail.clearSavedDraft,
    resetDraftState: rail.resetDraftState,
    setCommentTarget: store.setCommentTarget,
    setRightTab: store.setRightTab,
    upsertEvent: store.upsertEvent,
  });

  const setCommentFocus = useCallback(
    (lines: LineRange): void => {
      store.setCommentTarget(targetFrom(event.filename, lines));
    },
    [event.filename, store.setCommentTarget],
  );
  const matchesActiveTarget = useCallback((): boolean => {
    const target = store.activeTarget;
    if (target === null || target.kind !== NO_LOOSE_STRING_VALUES.event) return false;
    return target.file === event.filename && target.lines !== undefined;
  }, [event.filename, store.activeTarget]);
  const activeLines = useCallback((): LineRange | null => {
    const target = store.activeTarget;
    if (
      target === null ||
      target.kind !== NO_LOOSE_STRING_VALUES.event ||
      target.file !== event.filename
    ) {
      return null;
    }
    return target.lines ?? null;
  }, [event.filename, store.activeTarget]);
  const { openThread, useInline } = useSyncInlineCommentThread(
    thread,
    matchesActiveTarget,
    activeLines,
    setCommentFocus,
  );

  const threadGroupKey =
    thread.threadTarget === null
      ? null
      : targetKey(event.filename, thread.threadTarget);
  const threadQuote =
    thread.threadTarget === null
      ? null
      : quoteFromEventTarget(event, thread.threadTarget);

  return (
    <div
      ref={rail.wrapRef}
      className="commentable prose-commentable"
      onMouseMove={rail.onMouseMove}
      onMouseLeave={rail.onMouseLeave}
      onMouseUp={rail.onMouseUp}
    >
      <div ref={rail.contentRef} className="commentable-content">
        <LineCommentContent
          content={content}
          mode={mode}
          className={className}
          revealWords={revealWords}
          highlightLines={highlightLines}
          lineBoxes={rail.lineBoxes}
          lineHeight={lineHeight}
        />
      </div>
      <DraftLineNumbers
        layouts={rail.draftMarkerLayouts}
        popoverTarget={rail.popoverTarget}
      />
      <ExistingCommentMarkers
        layouts={existingMarkerLayouts}
        activeTarget={store.activeTarget}
        filename={event.filename}
        onFocusComments={openThread}
      />
      <DraftCommentMarkers
        layouts={rail.draftMarkerLayouts}
        popoverTarget={rail.popoverTarget}
        onOpenDraft={rail.openDraft}
      />
      <LineCommentPopoverHost
        rail={rail}
        content={content}
        title={documentTitle}
        currentWho={currentWho}
        busy={busy}
        participants={participants}
        currentSessionId={store.currentSessionId}
        token={store.token}
        onSubmit={submitComment}
      />
      {useInline && thread.threadTarget !== null && threadGroupKey !== null ? (
        <InlineCommentThreadPopover
          groupKey={threadGroupKey}
          title={documentTitle}
          lines={thread.threadTarget}
          quote={threadQuote}
          contentAnchor={rail.contentRef.current}
          lineBottomWithinAnchor={thread.threadAnchorBottom}
          onClose={thread.closeThread}
        />
      ) : null}
    </div>
  );
}
