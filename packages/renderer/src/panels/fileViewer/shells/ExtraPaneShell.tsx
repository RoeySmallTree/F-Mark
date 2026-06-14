import { useCallback, useEffect, useRef } from "react";
import { PanelRightClose } from "lucide-react";
import {
  useStore,
  FILE_VIEWER_EXTRA_DEFAULT_W,
} from "../../../state/store.js";
import { FileViewer } from "../FileViewer.js";

/* Extra pane — a resizable column between the feed-col and the right
   panel. The resizer is a thin column on the left edge; the collapse
   button lives in the chrome's leading slot. */
export function ExtraPaneShell(): JSX.Element {
  const sid = useStore((s) => s.currentSessionId);
  const width = useStore((s) =>
    sid !== null
      ? (s.fileViewerExtraWidthBySession[sid] ?? FILE_VIEWER_EXTRA_DEFAULT_W)
      : FILE_VIEWER_EXTRA_DEFAULT_W,
  );
  const setWidth = useStore((s) => s.setFileViewerExtraWidth);
  const setCollapsed = useStore((s) => s.setFileViewerExtraCollapsed);

  const startRef = useRef<{ x: number; w: number } | null>(null);
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      startRef.current = { x: e.clientX, w: width };
    },
    [width],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const s = startRef.current;
      if (s === null) return;
      const dx = s.x - e.clientX; /* dragging left = wider */
      setWidth(s.w + dx);
    },
    [setWidth],
  );
  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.releasePointerCapture(e.pointerId);
      startRef.current = null;
    },
    [],
  );

  /* Expose the width as a CSS var so the floating collapsed-extra button
     can sit just outside the pane's left edge. */
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--fv-extra-w",
      `${width}px`,
    );
  }, [width]);

  const collapse = useCallback(
    () => setCollapsed(true),
    [setCollapsed],
  );

  return (
    <aside
      className="fv-extra-pane"
      aria-label="File viewer"
      style={{ width }}
    >
      <div
        className="fv-extra-resizer"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        title="Drag to resize"
      />
      <FileViewer
        leadingControls={
          <button
            type="button"
            className="fv-extra-collapse"
            onClick={collapse}
            title="Collapse extra pane"
            aria-label="Collapse extra pane"
          >
            <PanelRightClose size={14} aria-hidden />
          </button>
        }
      />
    </aside>
  );
}
