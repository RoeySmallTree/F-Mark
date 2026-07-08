import { useLayoutEffect, useRef } from "react";

const NO_LOOSE_STRING_VALUES = {
  none: "none",
} as const;

/* FLIP layout-reorder hook — captures element bounding rects between
   renders and applies a single transform + transition so children animate
   from their previous position to their new one. The reorder itself
   happens via the parent's sorted children list; this hook only
   smooths over the visual jump.

   Each child must carry a stable `data-flip-id` attribute. Pass the
   container ref. */
export function useFlipReorder(
  containerRef: React.RefObject<HTMLElement | null>,
  deps: ReadonlyArray<unknown>,
  options?: { duration?: number; easing?: string },
): void {
  const prev = useRef<Map<string, DOMRect>>(new Map());
  const duration = options?.duration ?? 320;
  const easing = options?.easing ?? "cubic-bezier(0.22, 1, 0.36, 1)";

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const items = Array.from(
      container.querySelectorAll<HTMLElement>("[data-flip-id]"),
    );
    const nextPositions = new Map<string, DOMRect>();
    for (const el of items) {
      const id = el.dataset.flipId;
      if (id === undefined) continue;
      const rect = el.getBoundingClientRect();
      nextPositions.set(id, rect);
      const prevRect = prev.current.get(id);
      if (prevRect === undefined) continue;
      const dx = prevRect.left - rect.left;
      const dy = prevRect.top - rect.top;
      if (dx === 0 && dy === 0) continue;
      el.style.transition = NO_LOOSE_STRING_VALUES.none;
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      /* Force a reflow so the browser registers the starting offset
         before we revert to the natural position. Without this the
         transition becomes a no-op on the same frame. */
      void el.offsetWidth;
      el.style.transition = `transform ${duration}ms ${easing}`;
      el.style.transform = "";
    }
    prev.current = nextPositions;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
