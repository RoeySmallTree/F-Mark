import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  type RefObject,
} from "react";
import {
  fallbackLineBoxes,
  measureLineBoxes,
  sameLineBoxes,
  type LineBox,
} from "./lineGeometry.js";

interface UseLineMeasurementsOptions {
  contentRef: RefObject<HTMLElement>;
  content: string;
  mode: unknown;
  lineCount: number;
  lineHeight: number;
}

export function useLineMeasurements({
  contentRef,
  content,
  mode,
  lineCount,
  lineHeight,
}: UseLineMeasurementsOptions): {
  lineBoxes: LineBox[];
  refreshLineBoxes(): LineBox[];
} {
  const [lineBoxes, setLineBoxes] = useState<LineBox[]>(() =>
    fallbackLineBoxes(lineCount, lineHeight),
  );

  const refreshLineBoxes = useCallback((): LineBox[] => {
    const measured = measureLineBoxes(contentRef.current, lineCount, lineHeight);
    setLineBoxes((prev) => (sameLineBoxes(prev, measured) ? prev : measured));
    return measured;
  }, [contentRef, lineCount, lineHeight]);

  useLayoutEffect(() => {
    refreshLineBoxes();
  }, [content, mode, refreshLineBoxes]);

  useEffect(() => {
    const root = contentRef.current;
    if (root === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => refreshLineBoxes());
    observer.observe(root);
    return () => observer.disconnect();
  }, [content, mode, contentRef, refreshLineBoxes]);

  return { lineBoxes, refreshLineBoxes };
}
