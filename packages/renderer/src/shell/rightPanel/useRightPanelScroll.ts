import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
  type UIEvent,
} from "react";
import { rightScrollKey } from "../../state/panePersistence.js";
import type { RightPanelActivePane } from "./useRightPanelDockController.js";

export function useRightPanelScroll(
  currentSessionId: string | null,
  activePane: RightPanelActivePane,
  scrollMap: Record<string, number>,
  setRightScroll: (pane: string, scrollTop: number) => void,
): {
  onPanelScroll(event: UIEvent<HTMLDivElement>): void;
  scrollRef: RefObject<HTMLDivElement>;
} {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollSaveTimerRef = useRef<number | null>(null);

  // Restore this pane's own saved scroll. The effect re-runs on pane change, so
  // every pane keeps its position instead of sharing one per-session slot.
  useLayoutEffect(() => {
    const root = scrollRef.current;
    if (root === null || currentSessionId === null) return;
    root.scrollTop = scrollMap[rightScrollKey(currentSessionId, activePane)] ?? 0;
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
        setRightScroll(activePane, top);
      }, 200);
    },
    [setRightScroll, activePane],
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
