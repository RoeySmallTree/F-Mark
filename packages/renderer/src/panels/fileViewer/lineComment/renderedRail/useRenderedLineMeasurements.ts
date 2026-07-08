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
} from "../lineMeasure.js";

interface UseRenderedLineMeasurementsOptions {
  contentRef: RefObject<HTMLElement>;
  text: string;
  lineCount: number;
  lineHeight: number;
}

function observeResize(
  root: HTMLElement | null,
  onResize: () => void,
): (() => void) | undefined {
  if (root === null || typeof ResizeObserver === "undefined") return undefined;
  const observer = new ResizeObserver(onResize);
  observer.observe(root);
  return () => observer.disconnect();
}

export function useRenderedLineMeasurements({
  contentRef,
  text,
  lineCount,
  lineHeight,
}: UseRenderedLineMeasurementsOptions): {
  lineBoxes: LineBox[];
  refreshLineBoxes(): LineBox[];
} {
  const [lineBoxes, setLineBoxes] = useState<LineBox[]>(() =>
    fallbackLineBoxes(lineCount, lineHeight),
  );

  const measureCurrentLines = useCallback(
    () => measureLineBoxes(contentRef.current, lineCount, lineHeight),
    [contentRef, lineCount, lineHeight],
  );

  const refreshLineBoxes = useCallback((): LineBox[] => {
    const nextBoxes = measureCurrentLines();
    setLineBoxes((currentBoxes) =>
      sameLineBoxes(currentBoxes, nextBoxes) ? currentBoxes : nextBoxes,
    );
    return nextBoxes;
  }, [measureCurrentLines]);

  const refreshAfterResize = useCallback((): void => {
    refreshLineBoxes();
  }, [refreshLineBoxes]);

  useLayoutEffect(() => {
    refreshLineBoxes();
  }, [refreshLineBoxes, text]);

  useEffect(() => {
    return observeResize(contentRef.current, refreshAfterResize);
  }, [contentRef, refreshAfterResize]);

  return { lineBoxes, refreshLineBoxes };
}
