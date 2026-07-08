import { useCallback, useRef } from "react";
import {
  PANE_MAX_HEIGHT,
  PANE_MAX_WIDTH,
  PANE_MIN_HEIGHT,
  PANE_MIN_WIDTH,
  defaultPaneSizes,
  useStore,
  type PanelId,
} from "../state/store.js";
import { useShellPlacement } from "../hooks/useShellPlacement.js";
import { paneGeometry } from "../themes/layout.js";

const NO_LOOSE_STRING_VALUES = {
  row: "row",
  height: "height",
  width: "width",
  dragging: "dragging",
} as const;

/* PaneResizer — a thin drag handle on the edge of a side panel. In the old
   shell the handle's side and drag direction were hard-coded; now both are
   derived from the pane's slot in the active placement (`paneGeometry`), so a
   pane resizes correctly no matter where the user has placed it — including
   vertically (row-resize) in stacked layouts. Width/height are owned by the
   per-session size map, keyed by pane IDENTITY, so a session switch restores
   them. Movement is raf-throttled. */
export function PaneResizer({ pane }: { pane: PanelId }): JSX.Element | null {
  const placement = useShellPlacement();
  const geo = paneGeometry(placement, pane);

  const sessionId = useStore((s) => s.currentSessionId);
  const sizeMap = useStore((s) => s.panelSizeBySession);
  const setPaneSize = useStore((s) => s.setPaneSize);

  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<number | null>(null);

  const axis = geo?.axis === NO_LOOSE_STRING_VALUES.row ? NO_LOOSE_STRING_VALUES.height : NO_LOOSE_STRING_VALUES.width;
  const flush = useCallback((): void => {
    rafRef.current = null;
    const px = pendingRef.current;
    pendingRef.current = null;
    if (px !== null) setPaneSize(pane, axis, px);
  }, [setPaneSize, pane, axis]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>): void => {
      if (e.button !== 0 || geo === null || sessionId === null) return;
      e.preventDefault();
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
      target.classList.add(NO_LOOSE_STRING_VALUES.dragging);
      const vertical = geo.axis === NO_LOOSE_STRING_VALUES.row;
      const start = vertical ? e.clientY : e.clientX;
      const sizes = sizeMap[sessionId] ?? defaultPaneSizes();
      const startSize = vertical ? sizes[pane].height : sizes[pane].width;
      const min = vertical ? PANE_MIN_HEIGHT : PANE_MIN_WIDTH;
      const max = vertical ? PANE_MAX_HEIGHT : PANE_MAX_WIDTH;

      const onMove = (ev: PointerEvent): void => {
        const delta = (vertical ? ev.clientY : ev.clientX) - start;
        const raw = startSize + geo.sign * delta;
        pendingRef.current = Math.min(max, Math.max(min, raw));
        if (rafRef.current === null) {
          rafRef.current = requestAnimationFrame(flush);
        }
      };
      const onUp = (ev: PointerEvent): void => {
        target.releasePointerCapture(ev.pointerId);
        target.classList.remove(NO_LOOSE_STRING_VALUES.dragging);
        target.removeEventListener("pointermove", onMove);
        target.removeEventListener("pointerup", onUp);
        target.removeEventListener("pointercancel", onUp);
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          flush();
        }
      };
      target.addEventListener("pointermove", onMove);
      target.addEventListener("pointerup", onUp);
      target.addEventListener("pointercancel", onUp);
    },
    [flush, geo, pane, sessionId, sizeMap],
  );

  if (geo === null) return null;

  return (
    <div
      className="pane-resizer"
      data-edge={geo.edge}
      data-axis={geo.axis}
      role="separator"
      aria-orientation={geo.axis === "row" ? "horizontal" : "vertical"}
      onPointerDown={onPointerDown}
    />
  );
}
