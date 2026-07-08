import { useCallback, useMemo, type JSX, type MutableRefObject } from "react";
import type { AnyEventRecord } from "@f-mark/shared";
import { quoteForFileCommentAtLines } from "../../../../comments/commentQuote.js";
import { lineContextForFileComment } from "../../../../comments/lineContextLookup.js";
import { useSyncInlineCommentThread } from "../../../../cards/lineCommentRail/useSyncInlineCommentThread.js";
import { useInlineThreadPopover } from "../../../../cards/lineCommentRail/useInlineThreadPopover.js";
import { InlineCommentThreadPopover } from "../../../../components/lineCommentPopover/InlineCommentThreadPopover.js";
import { fileTargetKey } from "../../../right/comments/commentModel.js";
import type { CommentTarget } from "../../../../state/store.js";
import { ExistingCommentRail } from "../../lineComment/renderedRail/RenderedRailLayers.js";
import type { RenderedCommentAnchor } from "../../lineComment/renderedRail/commentAnchors.js";
import type { LineRange } from "../../lineComment/lineMeasure.js";
import { useMonacoLineLayout } from "./useMonacoLineLayout.js";
import type { MonacoEditor, MonacoModule } from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  file: "file",
} as const;

interface MonacoCommentOverlayProps {
  path: string;
  text: string;
  scopedPath: string;
  events: AnyEventRecord[];
  anchors: RenderedCommentAnchor[];
  activeTarget: CommentTarget | null;
  lineCount: number;
  editorRef: MutableRefObject<MonacoEditor | null>;
  monacoRef: MutableRefObject<MonacoModule | null>;
  ready: boolean;
  setCommentTarget: (target: CommentTarget | null) => void;
}

export function MonacoCommentOverlay({
  path,
  text,
  scopedPath,
  events,
  anchors,
  activeTarget,
  lineCount,
  editorRef,
  monacoRef,
  ready,
  setCommentTarget,
}: MonacoCommentOverlayProps): JSX.Element | null {
  const { lineBoxes, lineHeight } = useMonacoLineLayout({
    editorRef,
    monacoRef,
    ready,
    lineCount,
  });
  const thread = useInlineThreadPopover({ lineBoxes, lineHeight });
  const fileTitle = useMemo(
    () => path.split("/").pop() ?? path,
    [path],
  );

  const setCommentFocus = useCallback(
    (lines: LineRange): void => {
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
    if (activeTarget === null) return false;
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
    thread.threadTarget !== null
      ? fileTargetKey(scopedPath, { lines: thread.threadTarget })
      : null;
  const threadQuote =
    thread.threadTarget !== null
      ? quoteForFileCommentAtLines({
          events,
          filePath: scopedPath,
          lines: thread.threadTarget,
          fileText: text,
        })
      : null;

  if (!ready || anchors.length === 0) {
    return useInline && thread.threadTarget !== null && threadGroupKey !== null ? (
      <InlineCommentThreadPopover
        groupKey={threadGroupKey}
        title={fileTitle}
        lines={thread.threadTarget}
        quote={threadQuote}
        contentAnchor={editorRef.current?.getDomNode() ?? null}
        lineBottomWithinAnchor={thread.threadAnchorBottom}
        onClose={thread.closeThread}
      />
    ) : null;
  }

  return (
    <>
      <div className="fv-monaco-comment-overlay" aria-hidden={false}>
        <ExistingCommentRail
          anchors={anchors}
          activeTarget={activeTarget}
          lineBoxes={lineBoxes}
          lineHeight={lineHeight}
          lineCount={lineCount}
          onFocusComments={openThread}
        />
      </div>
      {useInline && thread.threadTarget !== null && threadGroupKey !== null ? (
        <InlineCommentThreadPopover
          groupKey={threadGroupKey}
          title={fileTitle}
          lines={thread.threadTarget}
          quote={threadQuote}
          contentAnchor={editorRef.current?.getDomNode() ?? null}
          lineBottomWithinAnchor={thread.threadAnchorBottom}
          onClose={thread.closeThread}
        />
      ) : null}
    </>
  );
}
