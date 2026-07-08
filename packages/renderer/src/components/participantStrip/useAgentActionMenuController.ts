import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  AGENT_ACTION_MENU_WIDTH,
  actionMenuTriggerRect,
  initialActionMenuAnchor,
  placeAgentActionMenu,
  sameTriggerRect,
  viewportSize,
} from "./actionMenuPosition.js";
import type { AgentActionMenuAnchor, AgentChipModel } from "./types.js";

interface AgentActionMenuController {
  openAgent: AgentChipModel | null;
  anchor: AgentActionMenuAnchor | null;
  popoverRef: RefObject<HTMLDivElement>;
  closeMenu(): void;
  toggleAgentMenu(participantId: string, trigger: HTMLElement): void;
}

export function useAgentActionMenuController(
  agents: AgentChipModel[],
): AgentActionMenuController {
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<AgentActionMenuAnchor | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const closeMenu = useCallback((): void => {
    setOpenMenuFor(null);
    setAnchor(null);
  }, []);

  const toggleAgentMenu = useCallback(
    (participantId: string, trigger: HTMLElement): void => {
      if (openMenuFor === participantId) {
        closeMenu();
        return;
      }
      setAnchor(
        initialActionMenuAnchor(actionMenuTriggerRect(trigger.getBoundingClientRect())),
      );
      setOpenMenuFor(participantId);
    },
    [closeMenu, openMenuFor],
  );

  const openAgent = useMemo(
    () => openMenuFor === null
      ? null
      : agents.find((agent) => agent.participant_id === openMenuFor) ?? null,
    [agents, openMenuFor],
  );

  useLayoutEffect(() => {
    if (openMenuFor === null || anchor === null) return;
    const node = popoverRef.current;
    if (node === null) return;
    const triggerRect = anchor.triggerRect;

    const reposition = (): void => {
      const rect = node.getBoundingClientRect();
      const next = placeAgentActionMenu(
        triggerRect,
        {
          width: rect.width || AGENT_ACTION_MENU_WIDTH,
          height: rect.height,
        },
        viewportSize(),
      );
      setAnchor((current) => {
        if (current === null || !sameTriggerRect(current.triggerRect, triggerRect)) {
          return current;
        }
        if (
          current.top === next.top &&
          current.left === next.left &&
          current.placement === next.placement &&
          current.maxHeight === next.maxHeight
        ) {
          return current;
        }
        return { ...current, ...next };
      });
    };

    reposition();
    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(reposition) : null;
    resizeObserver?.observe(node);
    window.addEventListener("resize", reposition);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", reposition);
    };
  }, [
    openMenuFor,
    anchor?.triggerRect.bottom,
    anchor?.triggerRect.left,
    anchor?.triggerRect.right,
    anchor?.triggerRect.top,
  ]);

  useEffect(() => {
    if (openMenuFor === null) return;
    function onDocMouseDown(event: MouseEvent): void {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest(".agent-action-menu")) return;
      if (event.target.closest(".agent-chip")) return;
      closeMenu();
    }
    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape") closeMenu();
    }
    const id = window.setTimeout(() => window.addEventListener("mousedown", onDocMouseDown), 0);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("mousedown", onDocMouseDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [closeMenu, openMenuFor]);

  return {
    openAgent,
    anchor,
    popoverRef,
    closeMenu,
    toggleAgentMenu,
  };
}
