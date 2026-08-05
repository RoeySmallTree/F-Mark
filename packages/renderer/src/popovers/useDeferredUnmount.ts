import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../shell/agentWorkingStrip/timing.js";

const EXIT_MS = 160;

/* Keeps a popover mounted for the length of its exit animation after its
   `isOpen` source turns false. Derived from state rather than from a close
   callback, so no close path can bypass it: openers, orchestrators and
   toggles all flip the same boolean. */
export function useDeferredUnmount(isOpen: boolean): {
  mounted: boolean;
  closing: boolean;
} {
  const [mounted, setMounted] = useState(isOpen);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      setMounted(true);
      return;
    }
    if (!mounted) return;
    if (prefersReducedMotion()) {
      setMounted(false);
      return;
    }
    timer.current = setTimeout(() => {
      timer.current = null;
      setMounted(false);
    }, EXIT_MS);
  }, [isOpen, mounted]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  return { mounted, closing: mounted && !isOpen };
}

/* Anchor rects for the locally-owned popovers (mentions, createTodo, fork,
   skills, and every store popover's activePopover.anchorRect) null out at
   the same instant the open flag flips false — the null rect IS the close
   signal. If that null rect reached Popover mid-exit the panel would jump
   to the top-left corner before the animation finished. Hold the last
   non-null rect across the exit window instead. */
export function useHeldAnchorRect(rect: DOMRect | null): DOMRect | null {
  const held = useRef<DOMRect | null>(rect);
  if (rect !== null) held.current = rect;
  return held.current;
}
