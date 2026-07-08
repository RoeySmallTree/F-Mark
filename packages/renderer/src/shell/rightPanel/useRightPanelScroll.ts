import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
  type UIEvent,
} from "react";
import type { RightPanelActivePane } from "./useRightPanelDockController.js";

export function useRightPanelScroll(
  currentSessionId: string | null,
  activePane: RightPanelActivePane,
  scrollMap: Record<string, number>,
  setRightScroll: (scrollTop: number) => void,
): {
  onPanelScroll(event: UIEvent<HTMLDivElement>): void;
  scrollRef: RefObject<HTMLDivElement>;
} {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollSaveTimerRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const root = scrollRef.current;
    if (root === null || currentSessionId === null) return;
    root.scrollTop = scrollMap[currentSessionId] ?? 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSessionId, activePane]);

  const onPanelScroll = useCallback(
    (event: UIEvent<HTMLDivElement>): void => {
      const top = event.currentTarget.scrollTop;
      if (scrollSaveTimerRef.current !== null) {
        clearTimeout(scrollSaveTimerRef.current);
      }
      scrollSaveTimerRef.current = window.setTimeout(() => {
        scrollSaveTimerRef.current = null;
        setRightScroll(top);
      }, 200);
    },
    [setRightScroll],
  );

  useEffect(
    () => () => {
      if (scrollSaveTimerRef.current !== null) {
        clearTimeout(scrollSaveTimerRef.current);
      }
    },
    [],
  );

  return { onPanelScroll, scrollRef };
}
