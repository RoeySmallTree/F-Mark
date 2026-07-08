/* Inline ⇄ side-by-side diff style, as an icon-only segmented control that
   sits in the FileViewer chrome BESIDE the DiffModeToggle dropdown (it used to
   live inside that dropdown). Only mounted by the FileViewer when a textual
   diff is actually on screen. Per-tab style lives in the store
   (fileViewerDiffBySession), same as the mode. */

import { Columns2, Rows3 } from "lucide-react";
import {
  useStore,
  DEFAULT_FILE_VIEWER_DIFF,
  type FileViewerDiffStyle,
} from "../../state/store.js";

export interface DiffStyleToggleProps {
  /** The standalone /file-tree tab passes its in-memory session namespace. */
  sessionKey?: string;
}

export function DiffStyleToggle({
  sessionKey,
}: DiffStyleToggleProps): JSX.Element | null {
  const sid = useStore((s) => s.currentSessionId);
  const key = sessionKey ?? sid;
  const activePath = useStore((s) =>
    sessionKey !== undefined
      ? (s.fileViewerActiveBySession[sessionKey] ?? null)
      : s.currentSessionId !== null
        ? (s.fileViewerActiveBySession[s.currentSessionId] ?? null)
        : null,
  );
  const style = useStore((s) =>
    key !== null && activePath !== null
      ? (s.fileViewerDiffBySession[key]?.[activePath]?.style ??
        DEFAULT_FILE_VIEWER_DIFF.style)
      : DEFAULT_FILE_VIEWER_DIFF.style,
  );
  const setDiff = useStore((s) => s.setFileViewerDiff);

  if (activePath === null) return null;

  const set = (next: FileViewerDiffStyle): void =>
    setDiff(activePath, { style: next }, sessionKey);

  return (
    <div
      className="fv-diff-style-toggle"
      role="group"
      aria-label="Diff layout"
      data-testid="diff-style-toggle"
    >
      <button
        type="button"
        className={`fv-diff-style-ibtn ${style === "inline" ? "is-current" : ""}`}
        onClick={() => set("inline")}
        title="Inline diff"
        aria-label="Inline diff"
        aria-pressed={style === "inline"}
        data-testid="diff-style-inline"
      >
        <Rows3 size={13} aria-hidden />
      </button>
      <button
        type="button"
        className={`fv-diff-style-ibtn ${style === "side-by-side" ? "is-current" : ""}`}
        onClick={() => set("side-by-side")}
        title="Side-by-side diff"
        aria-label="Side-by-side diff"
        aria-pressed={style === "side-by-side"}
        data-testid="diff-style-side-by-side"
      >
        <Columns2 size={13} aria-hidden />
      </button>
    </div>
  );
}
