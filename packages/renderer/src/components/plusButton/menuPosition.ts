import type { CSSProperties } from "react";
import type { MenuPosition } from "./types.js";

const MENU_MARGIN = 10;
const ESTIMATED_MENU_WIDTH = 468;
const ESTIMATED_MENU_HEIGHT = 420;
const MENU_PLACEMENTS = {
  above: "above",
  below: "below",
} as const;
const HIDDEN_MENU_STYLE: CSSProperties = {
  position: "fixed",
  visibility: "hidden",
};

export function readMenuPosition(
  anchor: HTMLElement,
  menu: HTMLElement | null = null,
): MenuPosition {
  const rect = anchor.getBoundingClientRect();
  const menuWidth = menu?.offsetWidth || ESTIMATED_MENU_WIDTH;
  const menuHeight = menu?.offsetHeight || ESTIMATED_MENU_HEIGHT;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const maxLeft = Math.max(MENU_MARGIN, viewportWidth - menuWidth - MENU_MARGIN);
  const preferredLeft = rect.right - menuWidth;
  const left = clamp(preferredLeft, MENU_MARGIN, maxLeft);
  const topAbove = rect.top - menuHeight - MENU_MARGIN;
  const topBelow = rect.bottom + MENU_MARGIN;
  const hasRoomAbove = topAbove >= MENU_MARGIN;
  const hasRoomBelow = topBelow + menuHeight <= viewportHeight - MENU_MARGIN;

  if (hasRoomAbove || !hasRoomBelow) {
    const maxTop = Math.max(MENU_MARGIN, viewportHeight - menuHeight - MENU_MARGIN);
    return {
      top: clamp(topAbove, MENU_MARGIN, maxTop),
      left,
      placement: MENU_PLACEMENTS.above,
    };
  }

  return {
    top: topBelow,
    left,
    placement: MENU_PLACEMENTS.below,
  };
}

export function menuStyleFromPosition(
  menuPosition: MenuPosition | null,
): CSSProperties {
  if (menuPosition === null) return HIDDEN_MENU_STYLE;

  return {
    position: "fixed",
    top: menuPosition.top,
    left: menuPosition.left,
    marginBottom: 0,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
