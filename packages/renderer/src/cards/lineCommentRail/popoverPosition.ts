import type { CSSProperties } from "react";
import { clamp } from "./lineGeometry.js";

function popoverLeft(
  anchor: HTMLElement | null,
  width: number,
  viewportWidth: number,
): number {
  const rect = anchor?.getBoundingClientRect();
  return clamp(
    (rect?.right ?? viewportWidth) - 78 - width,
    8,
    Math.max(8, viewportWidth - width - 8),
  );
}

export function fixedPopoverStyle(
  anchor: HTMLElement | null,
  centerWithinAnchor: number,
): CSSProperties {
  const viewportWidth = Math.max(320, window.innerWidth || 320);
  const viewportHeight = Math.max(320, window.innerHeight || 320);
  const width = Math.min(292, viewportWidth - 16);
  const left = popoverLeft(anchor, width, viewportWidth);
  const centerY = (anchor?.getBoundingClientRect().top ?? 0) + centerWithinAnchor;
  const estimatedHeight = 318;
  const top = clamp(
    centerY - estimatedHeight / 2,
    8,
    Math.max(8, viewportHeight - estimatedHeight - 8),
  );
  return {
    position: "fixed",
    top,
    left,
    right: "auto",
    transform: "none",
    width,
  };
}

/** Bottom-anchored thread popover: grows upward from the commented line so the
    reply row stays visible without scrolling the whole shell. */
export function fixedThreadPopoverStyle(
  anchor: HTMLElement | null,
  lineBottomWithinAnchor: number,
): CSSProperties {
  const viewportWidth = Math.max(320, window.innerWidth || 320);
  const viewportHeight = Math.max(320, window.innerHeight || 320);
  const width = Math.min(340, viewportWidth - 16);
  const left = popoverLeft(anchor, width, viewportWidth);
  const anchorTop = anchor?.getBoundingClientRect().top ?? 0;
  const lineBottomViewport = anchorTop + lineBottomWithinAnchor;
  const gapBelowLine = 8;
  const bottom = clamp(
    viewportHeight - lineBottomViewport - gapBelowLine,
    8,
    viewportHeight - 8,
  );
  const preferredHeight = Math.min(520, Math.round(viewportHeight * 0.72));
  const maxHeight = Math.min(
    preferredHeight,
    Math.max(280, lineBottomViewport - 8),
  );
  return {
    position: "fixed",
    bottom,
    top: "auto",
    left,
    right: "auto",
    transform: "none",
    width,
    maxHeight,
  };
}
