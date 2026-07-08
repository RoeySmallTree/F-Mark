import {
  useCallback,
  useMemo,
  useRef,
  type JSX,
  type ReactNode,
} from "react";
import { createClient } from "../../../api/client.js";
import { useScopedFile } from "../fileScope.js";
import { useDefaultFileCommentMentions } from "./FileCommentDraftPopover.js";
import { useFileCommentPoster } from "./useFileCommentPoster.js";
import {
  activeLinesForFileTarget,
  buildFileCommentAnchors,
} from "./renderedRail/commentAnchors.js";
import {
  DraftCommentRail,
  ExistingCommentRail,
  RenderedDraftPopover,
  RenderedRailContent,
} from "./renderedRail/RenderedRailLayers.js";
import { useRenderedLineMeasurements } from "./renderedRail/useRenderedLineMeasurements.js";
import { useRenderedRailDraft } from "./renderedRail/useRenderedRailDraft.js";
import { useRenderedRailReveal } from "./renderedRail/useRenderedRailReveal.js";
import { useRenderedRailStoreBindings } from "./renderedRail/useRenderedRailStoreBindings.js";
import { useRenderedSourceText } from "./renderedRail/useRenderedSourceText.js";
import type { LineRange } from "./lineMeasure.js";
import { InlineCommentThreadPopover } from "../../../components/lineCommentPopover/InlineCommentThreadPopover.js";
import { quoteForFileCommentAtLines } from "../../../comments/commentQuote.js";
import { lineContextForFileComment } from "../../../comments/lineContextLookup.js";
import { fileTargetKey } from "../../../panels/right/comments/commentModel.js";
import { useInlineThreadPopover } from "../../../cards/lineCommentRail/useInlineThreadPopover.js";
import { useSyncInlineCommentThread } from "../../../cards/lineCommentRail/useSyncInlineCommentThread.js";

const NO_LOOSE_STRING_VALUES = {
  file: "file",
} as const;

export interface RenderedLineCommentRailProps {
  /** Absolute viewer path of the wrapped file. */
  path: string;
  /** Current source text when the wrapped renderer already owns editable text. */
  sourceText?: string;
  /** Approximate row height for the fallback layout (px). */
  lineHeight?: number;
  children: ReactNode;
}

/* LineCommentRail-style affordance for the file viewer's NON-code renderers
   (markdown / csv). It wraps the renderer, fetches the file's text (for line
   count + drift-repair line_context), and overlays a hover/drag-select rail +
   draft popover that posts a file-comment via the shared poster. Reveal is
   best-effort: when the store's pendingFileReveal targets this path we scroll
   the line's measured box into view and flash a band.

   The renderers paint into their own DOM (cherry/papaparse) and fetch their own
   text independently, so this overlay does NOT reach into them — it measures
   rendered text rows of the wrapped subtree (same heuristic the chat
   LineCommentRail uses) to map a pointer Y / selection to a source line. */
export function RenderedLineCommentRail({
  path,
  sourceText,
  lineHeight = 22,
  children,
}: RenderedLineCommentRailProps): JSX.Element {
  const {
    token,
    events,
    activeTarget,
    setCommentTarget,
    pendingFileReveal,
    clearFileReveal,
  } = useRenderedRailStoreBindings();

  const poster = useFileCommentPoster();
  const defaultMentions = useDefaultFileCommentMentions();
  const scoped = useScopedFile(path);
  const scopedPath = scoped?.relPath ?? null;
  const client = useMemo(() => createClient({ baseUrl: "", token }), [token]);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const fetchedText = useRenderedSourceText({ client, path, scoped });
  const text = sourceText ?? fetchedText;
  const lineCount = Math.max(1, text.split(/\r?\n/).length);
  const { lineBoxes, refreshLineBoxes } = useRenderedLineMeasurements({
    contentRef,
    text,
    lineCount,
    lineHeight,
  });

  /* Existing file comments on THIS file → markers in the rail.

     Mirrors RightComments.buildThreads / the chat LineCommentRail filtering:
     `_removed_`/`_resolved_` supersession markers (content + `supersedes`, no
     `file_path` of their own) must NOT surface as live comments, and a file
     comment whose chain has been REMOVED must drop out entirely (RightComments
     no longer renders it). Resolved chains are kept but flagged + counted the
     way the chat rail does (resolved markers don't inflate the count). Since
     the RightComments helpers aren't exported, we replicate the minimal
     chain-aware skip here. */
  const anchors = useMemo(() => {
    return buildFileCommentAnchors({ events, scopedPath, lineCount });
  }, [events, scopedPath, lineCount]);

  const highlightLines = activeLinesForFileTarget(
    activeTarget,
    scopedPath,
    lineCount,
  );

  /* Best-effort reveal — scroll the line's box into the wrapper viewport and
     flash the highlight band. X6: when the request carries line-drift repair
     inputs, re-locate the line against the CURRENT source text first; when
     nothing matches (line === null) reveal nothing. */
  useRenderedRailReveal({
    pendingFileReveal,
    path,
    text,
    lineCount,
    lineHeight,
    wrapRef,
    refreshLineBoxes,
    clearFileReveal,
  });

  const draft = useRenderedRailDraft({
    contentRef,
    lineBoxes,
    lineCount,
    lineHeight,
    text,
    path,
    poster,
    refreshLineBoxes,
  });
  const thread = useInlineThreadPopover({ lineBoxes, lineHeight });

  const fileTitle = path.split("/").pop() ?? path;

  const setCommentFocus = useCallback(
    (lines: LineRange): void => {
      if (scopedPath === null) return;
      const lineContext = lineContextForFileComment(events, scopedPath, lines);
      setCommentTarget({
        kind: NO_LOOSE_STRING_VALUES.file,
        file_path: scopedPath,
        lines,
        ...(lineContext !== undefined ? { line_context: lineContext } : {}),
      });
    },
    [events, scopedPath, setCommentTarget],
  );
  const matchesActiveTarget = useCallback((): boolean => {
    if (scopedPath === null || activeTarget === null) return false;
    return (
      activeTarget.kind === NO_LOOSE_STRING_VALUES.file &&
      activeTarget.file_path === scopedPath &&
      activeTarget.lines !== undefined
    );
  }, [activeTarget, scopedPath]);
  const activeLines = useCallback((): LineRange | null => {
    if (!matchesActiveTarget()) return null;
    return activeTarget?.lines ?? null;
  }, [activeTarget, matchesActiveTarget]);
  const { openThread, useInline } = useSyncInlineCommentThread(
    thread,
    matchesActiveTarget,
    activeLines,
    setCommentFocus,
  );
  const threadGroupKey =
    thread.threadTarget !== null && scopedPath !== null
      ? fileTargetKey(scopedPath, { lines: thread.threadTarget })
      : null;
  const threadQuote =
    thread.threadTarget !== null && scopedPath !== null
      ? quoteForFileCommentAtLines({
          events,
          filePath: scopedPath,
          lines: thread.threadTarget,
          fileText: text,
        })
      : null;

  return (
    <div
      ref={wrapRef}
      className="fv-line-comment-overlay commentable"
      onMouseMove={draft.onMouseMove}
      onMouseLeave={draft.onMouseLeave}
      onMouseUp={draft.onMouseUp}
    >
      <RenderedRailContent
        contentRef={contentRef}
        highlightLines={highlightLines}
        lineBoxes={lineBoxes}
        lineHeight={lineHeight}
      >
        {children}
      </RenderedRailContent>

      {/* Existing-comment markers */}
      <ExistingCommentRail
        anchors={anchors}
        activeTarget={activeTarget}
        lineBoxes={lineBoxes}
        lineHeight={lineHeight}
        lineCount={lineCount}
        onFocusComments={openThread}
      />

      {/* Draft / hover marker */}
      <DraftCommentRail
        visibleDraft={draft.visibleDraft}
        canPost={poster.canPost}
        popoverTarget={draft.popoverTarget}
        lineBoxes={lineBoxes}
        lineHeight={lineHeight}
        onOpenDraft={draft.openDraft}
      />

      <RenderedDraftPopover
        popoverTarget={draft.popoverTarget}
        title={fileTitle}
        text={text}
        busy={poster.busy}
        defaultMentions={defaultMentions}
        anchor={contentRef.current}
        popoverTop={draft.popoverTop}
        onSubmit={(content, mentions) => void draft.submitDraft(content, mentions)}
        onClose={draft.closeDraft}
      />
      {useInline && thread.threadTarget !== null && threadGroupKey !== null ? (
        <InlineCommentThreadPopover
          groupKey={threadGroupKey}
          title={fileTitle}
          lines={thread.threadTarget}
          quote={threadQuote}
          contentAnchor={contentRef.current}
          lineBottomWithinAnchor={thread.threadAnchorBottom}
          onClose={thread.closeThread}
        />
      ) : null}
    </div>
  );
}
