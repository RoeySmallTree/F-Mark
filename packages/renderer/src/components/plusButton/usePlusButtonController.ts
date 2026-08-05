import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useDeferredUnmount } from "../../popovers/useDeferredUnmount.js";
import { buildRuntimeMenuItems } from "./model.js";
import {
  menuStyleFromPosition,
  readMenuPosition,
} from "./menuPosition.js";
import type {
  MenuPosition,
  PlusButtonController,
  RuntimeMenuItemModel,
} from "./types.js";
import type { PlusButtonProps } from "../PlusButton.js";

export function usePlusButtonController({
  runtimes,
  onSpawnRuntime,
  onManageRuntimes,
  accessModeForRuntime,
  accessModeOptionsForRuntime,
  onAccessModeChange,
  modelForRuntime,
  effortForRuntime,
  modelOptionsForRuntime,
  effortOptionsForRuntime,
  onModelChange,
  onEffortChange,
  spawnDisabledReason = null,
}: PlusButtonProps): PlusButtonController {
  const [open, setOpen] = useState(false);
  const [expandedRuntimeId, setExpandedRuntimeId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  /* `open` is the only source of truth. Every close path — the dismissal
     hook, the toggle, spawning a runtime, opening the runtime manager —
     sets it false directly; useDeferredUnmount observes that flip and
     keeps the menu mounted for its exit, so no closer needs to know about
     the animation. */
  const close = useCallback(() => {
    setOpen(false);
    setExpandedRuntimeId(null);
  }, []);
  const { mounted, closing } = useDeferredUnmount(open);

  const positionMenu = useCallback(() => {
    if (wrapRef.current === null) return;
    setMenuPosition(readMenuPosition(wrapRef.current, menuRef.current));
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPosition(null);
      return;
    }

    positionMenu();
  }, [open, positionMenu]);

  useLayoutEffect(() => {
    if (!open || menuRef.current === null) return;
    positionMenu();
  }, [expandedRuntimeId, open, positionMenu]);

  useMenuDismissal(open, wrapRef, close, positionMenu);

  const toggleOpen = useCallback(() => {
    if (open) {
      close();
      return;
    }
    setOpen(true);
  }, [close, open]);

  const spawnRuntime = useCallback(
    (item: RuntimeMenuItemModel) => {
      if (item.disabled) return;
      onSpawnRuntime(item.id);
      close();
    },
    [close, onSpawnRuntime],
  );

  const manageRuntimes = useCallback(() => {
    onManageRuntimes();
    close();
  }, [close, onManageRuntimes]);

  const changeAccessMode = useCallback(
    (id: string, mode: string) => {
      onAccessModeChange?.(id, mode);
    },
    [onAccessModeChange],
  );
  const changeModel = useCallback(
    (id: string, model: string) => {
      onModelChange?.(id, model);
    },
    [onModelChange],
  );
  const changeEffort = useCallback(
    (id: string, effort: string) => {
      onEffortChange?.(id, effort);
    },
    [onEffortChange],
  );
  const toggleRuntimeOptions = useCallback((id: string): void => {
    setExpandedRuntimeId((current) => (current === id ? null : id));
  }, []);

  return {
    open,
    mounted,
    closing,
    expandedRuntimeId,
    menuPlacement: menuPosition?.placement ?? null,
    wrapRef,
    menuRef,
    menuStyle: menuStyleFromPosition(menuPosition),
    runtimeItems: buildRuntimeMenuItems(
      runtimes,
      {
        accessModeForRuntime,
        accessModeOptionsForRuntime,
        modelForRuntime,
        effortForRuntime,
        modelOptionsForRuntime,
        effortOptionsForRuntime,
      },
      spawnDisabledReason,
    ),
    toggleOpen,
    spawnRuntime,
    manageRuntimes,
    changeAccessMode,
    changeModel,
    changeEffort,
    toggleRuntimeOptions,
  };
}

function useMenuDismissal(
  open: boolean,
  wrapRef: RefObject<HTMLDivElement>,
  close: () => void,
  positionMenu: () => void,
): void {
  useEffect(() => {
    if (!open) return;

    function onDocMouseDown(event: MouseEvent): void {
      if (wrapRef.current === null) return;
      if (!(event.target instanceof Node)) return;
      if (wrapRef.current.contains(event.target)) return;
      close();
    }

    function onKey(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
    }

    const timeoutId = window.setTimeout(() => {
      window.addEventListener("mousedown", onDocMouseDown);
    }, 0);

    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("mousedown", onDocMouseDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [open, wrapRef, close, positionMenu]);
}
