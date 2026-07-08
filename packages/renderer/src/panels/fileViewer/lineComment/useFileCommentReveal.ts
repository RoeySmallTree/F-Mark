import { useEffect, useRef } from "react";
import { normalizeRelSegments } from "../../../api/rootScope.js";
import { useStore, type CommentTarget } from "../../../state/store.js";
import { useSurfaceFileDisplay } from "../../../shell/fileDisplaySurface.js";
import { RIGHT_TAB_IDS } from "../../../state/rightTabsConfig.js";
import { useFileScope } from "../fileScope.js";
import { extOf, pickRenderer } from "../renderers/pickRenderer.js";

const NO_LOOSE_STRING_VALUES = {
  monaco: "monaco",
  markdown: "markdown",
  csv: "csv",
  file: "file",
  none: "none",
} as const;

/* Resolve a root-relative file-comment path back to the absolute viewer path
   identifier. The viewer/tree key tabs by absolute path; file comments store a
   root-relative `file_path`. Joining is the inverse of rootScope.toRootRelative
   (which strips `root + "/"`).

   Segment-aware (security): a crafted stored `file_path` like `"../secret"` or
   `"/etc/passwd"` must NOT resolve to `/project/../secret` and get opened. We
   normalize `.`/`..` lexically (no symlink follow) and reject any path that is
   absolute/drive-prefixed or escapes the root. Returns null when no root is
   known OR the relative path traverses out of root. */
function toAbsoluteUnderRoot(root: string | null, relPath: string): string | null {
  if (root === null) return null;
  const normalized = normalizeRelSegments(relPath);
  if (normalized === null) return null; // traversal / absolute — refuse
  const base = root.replace(/\/+$/, "");
  if (normalized.length === 0) return base;
  return `${base}/${normalized}`;
}

/* Renderers in the NON-diff branch of FileViewer that consume
   `pendingFileReveal` (scroll + flash the line). Reveal is forced into this
   branch (see below), so a reveal targeting a file whose renderer is NOT one of
   these (image/audio/video/office/binary) would leave `pendingFileReveal`
   stale forever. We open such a file but DON'T push a reveal for it — there is
   no line to scroll to anyway (those statuses never carry a line comment). */
function rendererConsumesReveal(absPath: string): boolean {
  const kind = pickRenderer(extOf(absPath));
  return kind === NO_LOOSE_STRING_VALUES.monaco || kind === NO_LOOSE_STRING_VALUES.markdown || kind === NO_LOOSE_STRING_VALUES.csv;
}

/* Reveal bridge. Watches `commentTarget`; when it points at a repo
   file with a line range (a file-comment thread/card was focused), opens that
   file in the viewer and asks the active renderer to scroll + flash the line
   via `pendingFileReveal`.

   Always-mounted: this must not live inside FileViewer,
   because the viewer may be unmounted when the reveal is needed (e.g. the dock
   File pane isn't the active center tab). It is mounted once in App and once in
   FileTreePage instead.

   To make a viewer SURFACE actually appear it:
     • opens the file (tab state),
     • reveals the file viewer in the dock via the FileDisplaySurface context
       (main app activates / re-homes the filesDisplay pane; the standalone page
       provides a no-op since its viewer is always mounted),
     • forces the file's tab into NON-diff (`none`) mode before revealing:
       diff mode is the default, but the reveal consumer
       (MonacoRenderer / RenderedLineCommentRail) only mounts in the non-diff
       branch, so without this the reveal would never be consumed.

   Idempotent: re-revealing the same target is cheap (openFile no-ops when the
   tab exists; the reveal nonce makes the renderer effect re-fire). */
export function useFileCommentReveal(): void {
  const commentTarget = useStore((s) => s.commentTarget);
  const openFile = useStore((s) => s.openFile);
  const requestFileReveal = useStore((s) => s.requestFileReveal);
  const setFileViewerDiff = useStore((s) => s.setFileViewerDiff);
  const setRightTab = useStore((s) => s.setRightTab);
  const surfaceFileDisplay = useSurfaceFileDisplay();
  const { root } = useFileScope();

  /* De-dupe by OBJECT REFERENCE, not value signature: a single click can
     re-render this hook many times (openFile/store churn), but every click
     produces a FRESH `commentTarget` object via setCommentTarget. Keying on
     the previous object reference means re-renders that reuse the same object
     are skipped, while a second click on the *same* file/line still refires
     (new object → new reveal nonce), which value-keying wrongly suppressed. */
  const lastTargetRef = useRef<CommentTarget | null>(null);

  useEffect(() => {
    if (commentTarget === null || commentTarget.kind !== NO_LOOSE_STRING_VALUES.file) {
      lastTargetRef.current = null;
      return;
    }
    if (lastTargetRef.current === commentTarget) return;
    lastTargetRef.current = commentTarget;

    const absPath = toAbsoluteUnderRoot(root, commentTarget.file_path);
    if (absPath === null) return;

    /* openFile adds/activates the tab (idempotent). Surfacing the viewer is the
       FileDisplaySurface context's job: in the main app it activates / re-homes
       the filesDisplay dock pane; the standalone page provides a no-op since its
       viewer is always mounted. */
    openFile(absPath);
    setRightTab(RIGHT_TAB_IDS.files);
    surfaceFileDisplay();

    /* Force the target tab into NON-diff mode (blocker 3): diff mode is the
       default, but the reveal consumer (MonacoRenderer / RenderedLineCommentRail)
       only mounts in the non-diff branch. Do this BEFORE requesting the reveal
       so the consumer is the one that mounts. */
    setFileViewerDiff(absPath, { mode: NO_LOOSE_STRING_VALUES.none });

    /* Push the reveal AFTER the open + mode switch so the renderer for this path
       is mounting; the renderer's effect honors the request once its editor is
       ready. The nonce guarantees a fresh trigger even if the path/line repeat.
       Skip files whose renderer can't consume a reveal (media/binary/office) so
       pendingFileReveal is never left stale.

       Thread the comment's line-drift repair inputs (X6): the stored
       `line_context` + `lines` let the renderer re-locate the target line in
       the CURRENT text rather than trusting `lines[0]` blindly. Additive — a
       target without line_context falls back to the plain `lines[0]` reveal. */
    if (commentTarget.lines !== undefined && rendererConsumesReveal(absPath)) {
      requestFileReveal(absPath, commentTarget.lines[0], {
        ...(commentTarget.line_context !== undefined
          ? { lineContext: commentTarget.line_context }
          : {}),
        lines: commentTarget.lines,
      });
    }
  }, [
    commentTarget,
    root,
    openFile,
    requestFileReveal,
    setFileViewerDiff,
    setRightTab,
    surfaceFileDisplay,
  ]);
}

export { toAbsoluteUnderRoot };
