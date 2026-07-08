const NO_LOOSE_STRING_VALUES = {
  bottom: "bottom",
  end: "end",
} as const;

/* Popover — generic anchored-overlay framework used by P8 (Presets),
   P9 (Skills), and P12 (Log filter). Renders a transparent backdrop that
   captures background clicks and a fixed-position .popover element next
   to the anchor element's bounding rect. Escape closes. Click outside
   closes. Click inside does not.

   Placement is a hint; the popover clamps itself to the viewport so it
   never paints offscreen. The minimum gap from the anchor is 6px and the
   minimum margin from the viewport edge is 8px. */

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export type PopoverPlacement =
  | "bottom-end"
  | "top-end"
  | "bottom-start"
  | "top-start";

interface Props {
  anchorRect: DOMRect | null;
  placement?: PopoverPlacement;
  onClose(): void;
  children: ReactNode;
  /* Optional className appended to the .popover element so individual
     popovers can size themselves (e.g. width:380 for the log filter). */
  className?: string;
  ariaLabel?: string;
}

const GAP = 6;
const EDGE = 8;
const MIN_WIDTH = 240;

function computePosition(
  anchor: DOMRect | null,
  panel: HTMLDivElement | null,
  placement: PopoverPlacement,
): CSSProperties {
  if (typeof window === "undefined") {
    return { position: "fixed", top: 0, left: 0 };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pw = panel?.offsetWidth ?? MIN_WIDTH;
  const ph = panel?.offsetHeight ?? 200;

  // Default to anchored at the bottom-end of the anchor rect (filter button).
  let top: number;
  let left: number;
  if (anchor === null) {
    top = EDGE;
    left = vw - pw - EDGE;
  } else {
    const placeBelow = placement.startsWith(NO_LOOSE_STRING_VALUES.bottom);
    const placeEnd = placement.endsWith(NO_LOOSE_STRING_VALUES.end);
    top = placeBelow ? anchor.bottom + GAP : anchor.top - GAP - ph;
    left = placeEnd ? anchor.right - pw : anchor.left;

    // If the panel would clip off the bottom, flip above; if it'd clip
    // off the top, flip below.
    if (top + ph > vh - EDGE) {
      const flipped = anchor.top - GAP - ph;
      if (flipped >= EDGE) top = flipped;
      else top = Math.max(EDGE, vh - ph - EDGE);
    }
    if (top < EDGE) top = EDGE;

    // Clamp horizontally within the viewport.
    if (left + pw > vw - EDGE) left = vw - pw - EDGE;
    if (left < EDGE) left = EDGE;
  }
  return { position: "fixed", top, left };
}

export function Popover({
  anchorRect,
  placement = "bottom-end",
  onClose,
  children,
  className,
  ariaLabel,
}: Props): JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>(() =>
    computePosition(anchorRect, null, placement),
  );

  /* Position once on mount + whenever the anchor or placement changes. */
  useLayoutEffect(() => {
    setStyle(computePosition(anchorRect, panelRef.current, placement));
  }, [anchorRect, placement]);

  /* Reposition on resize / scroll so it does not detach from the page.
     Also observe the panel's own size: async content (presets list, skills
     list, anything fetched after mount) grows the panel after the initial
     position is computed, so we must recompute to keep it anchored. */
  useEffect(() => {
    function reposition(): void {
      setStyle(computePosition(anchorRect, panelRef.current, placement));
    }
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    let observer: ResizeObserver | null = null;
    if (panelRef.current !== null && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(reposition);
      observer.observe(panelRef.current);
    }
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      observer?.disconnect();
    };
  }, [anchorRect, placement]);

  /* Escape closes. */
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div
        className="popover-backdrop"
        data-testid="popover-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        className={["popover", className].filter(Boolean).join(" ")}
        role="dialog"
        aria-modal="false"
        aria-label={ariaLabel}
        style={style}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </>
  );
}
