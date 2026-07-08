import type {
  AgentActionMenuAnchor,
  AgentActionMenuPlacement,
  AgentActionMenuTriggerRect,
} from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  below: "below",
  above: "above",
} as const;

export const AGENT_ACTION_MENU_WIDTH = 240;
const AGENT_ACTION_MENU_GAP = 4;
const AGENT_ACTION_MENU_VIEWPORT_PADDING = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function actionMenuTriggerRect(rect: DOMRect): AgentActionMenuTriggerRect {
  return {
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
  };
}

export function sameTriggerRect(
  a: AgentActionMenuTriggerRect,
  b: AgentActionMenuTriggerRect,
): boolean {
  return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;
}

export function placeAgentActionMenu(
  triggerRect: AgentActionMenuTriggerRect,
  menuSize: { width: number; height: number },
  viewport: { width: number; height: number },
): Omit<AgentActionMenuAnchor, "triggerRect"> {
  const maxHeight = Math.max(0, viewport.height - AGENT_ACTION_MENU_VIEWPORT_PADDING * 2);
  const menuWidth = Math.max(menuSize.width, AGENT_ACTION_MENU_WIDTH);
  const menuHeight = Math.min(Math.max(0, menuSize.height), maxHeight);

  const maxLeft = Math.max(
    AGENT_ACTION_MENU_VIEWPORT_PADDING,
    viewport.width - menuWidth - AGENT_ACTION_MENU_VIEWPORT_PADDING,
  );
  const left = clamp(
    triggerRect.right - menuWidth,
    AGENT_ACTION_MENU_VIEWPORT_PADDING,
    maxLeft,
  );

  const belowTop = triggerRect.bottom + AGENT_ACTION_MENU_GAP;
  const aboveTop = triggerRect.top - menuHeight - AGENT_ACTION_MENU_GAP;
  const spaceBelow = viewport.height - AGENT_ACTION_MENU_VIEWPORT_PADDING - belowTop;
  const spaceAbove = triggerRect.top - AGENT_ACTION_MENU_GAP - AGENT_ACTION_MENU_VIEWPORT_PADDING;
  const belowFits = spaceBelow >= menuHeight;
  const aboveFits = aboveTop >= AGENT_ACTION_MENU_VIEWPORT_PADDING;
  const placement: AgentActionMenuPlacement =
    belowFits || (!aboveFits && spaceBelow >= spaceAbove) ? NO_LOOSE_STRING_VALUES.below : NO_LOOSE_STRING_VALUES.above;
  const rawTop = placement === NO_LOOSE_STRING_VALUES.above ? aboveTop : belowTop;
  const maxTop = Math.max(
    AGENT_ACTION_MENU_VIEWPORT_PADDING,
    viewport.height - menuHeight - AGENT_ACTION_MENU_VIEWPORT_PADDING,
  );

  return {
    top: clamp(rawTop, AGENT_ACTION_MENU_VIEWPORT_PADDING, maxTop),
    left,
    placement,
    maxHeight,
  };
}

export function viewportSize(): { width: number; height: number } {
  return { width: window.innerWidth, height: window.innerHeight };
}

export function initialActionMenuAnchor(
  triggerRect: AgentActionMenuTriggerRect,
): AgentActionMenuAnchor {
  return {
    triggerRect,
    ...placeAgentActionMenu(
      triggerRect,
      { width: AGENT_ACTION_MENU_WIDTH, height: 0 },
      viewportSize(),
    ),
  };
}
