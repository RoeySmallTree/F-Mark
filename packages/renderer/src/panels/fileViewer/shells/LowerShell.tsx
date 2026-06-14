import { useCallback, useRef } from "react";
import {
  useStore,
  FILE_VIEWER_LOWER_DEFAULT_R,
} from "../../../state/store.js";
import { FileViewer } from "../FileViewer.js";

/* Lower shell — rendered inside RightFiles as the bottom section of the
   vertical split. The drag handle above it updates the split ratio. */
export function LowerShell(): JSX.Element {
  return <FileViewer />;
}

export interface LowerResizerProps {
  onRatio?: (ratio: number) => void;
}

export function LowerResizer({ onRatio }: LowerResizerProps): JSX.Element {
  const sid = useStore((s) => s.currentSessionId);
  const setRatio = useStore((s) => s.setFileViewerLowerRatio);
  const currentRatio = useStore((s) =>
    sid !== null
      ? (s.fileViewerLowerRatioBySession[sid] ??
        FILE_VIEWER_LOWER_DEFAULT_R)
      : FILE_VIEWER_LOWER_DEFAULT_R,
  );

  const startRef = useRef<{
    y: number;
    r: number;
    parentH: number;
  } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const parent = e.currentTarget.parentElement;
      if (parent === null) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      startRef.current = {
        y: e.clientY,
        r: currentRatio,
        parentH: parent.clientHeight,
      };
    },
    [currentRatio],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const s = startRef.current;
      if (s === null) return;
      const dy = e.clientY - s.y;
      const next = s.r + dy / s.parentH;
      setRatio(next);
      onRatio?.(next);
    },
    [setRatio, onRatio],
  );
  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.releasePointerCapture(e.pointerId);
      startRef.current = null;
    },
    [],
  );

  return (
    <div
      className="fv-lower-resizer"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      title="Drag to resize"
    />
  );
}
