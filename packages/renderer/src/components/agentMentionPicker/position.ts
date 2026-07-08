import type { CSSProperties } from "react";

const EDGE_GAP = 8;
const POPOVER_WIDTH = 392;

export function getMentionPickerStyle(anchorRect: DOMRect): CSSProperties {
  return {
    position: "fixed",
    left: Math.min(
      Math.max(EDGE_GAP, anchorRect.left),
      Math.max(EDGE_GAP, window.innerWidth - POPOVER_WIDTH),
    ),
    bottom: Math.max(EDGE_GAP, window.innerHeight - anchorRect.top + EDGE_GAP),
  };
}
