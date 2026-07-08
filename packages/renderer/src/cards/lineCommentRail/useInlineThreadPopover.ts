import { useCallback, useState } from "react";
import { boxForRange, type LineBox, type LineRange } from "./lineGeometry.js";

export function useInlineThreadPopover({
  lineBoxes,
  lineHeight,
}: {
  lineBoxes: LineBox[];
  lineHeight: number;
}) {
  const [threadTarget, setThreadTarget] = useState<LineRange | null>(null);

  const openThread = useCallback((lines: LineRange): void => {
    setThreadTarget(lines);
  }, []);

  const closeThread = useCallback((): void => {
    setThreadTarget(null);
  }, []);

  const threadTop =
    threadTarget !== null
      ? boxForRange(threadTarget, lineBoxes, lineHeight).center
      : 0;
  const threadAnchorBottom =
    threadTarget !== null
      ? boxForRange(threadTarget, lineBoxes, lineHeight).bottom
      : 0;

  return {
    threadTarget,
    threadTop,
    threadAnchorBottom,
    openThread,
    closeThread,
  };
}
