import { useCallback, useEffect, useRef, useState } from "react";
import { useToolboxAccordion } from "../toolboxAccordion.js";
import { TOOLBOX_COLLAPSE_MS } from "./presentation.js";

export interface ToolboxDisclosure {
  isOpen: boolean;
  mounted: boolean;
  shown: boolean;
  open(): void;
  toggle(): void;
}

export function useToolboxDisclosure(input: {
  groupId: string;
  wantsOpenByDefault: boolean;
}): ToolboxDisclosure {
  const { groupId, wantsOpenByDefault } = input;
  const accordion = useToolboxAccordion();
  const [localOpenId, setLocalOpenId] = useState<string | null>(() =>
    wantsOpenByDefault ? groupId : null,
  );
  const isOpen = accordion ? accordion.isOpen(groupId) : localOpenId === groupId;

  const openAutoSlot = useCallback(
    (id: string): void => {
      if (accordion) accordion.openAuto(id);
      else setLocalOpenId(id);
    },
    [accordion],
  );
  const openManualSlot = useCallback(
    (id: string): void => {
      if (accordion) accordion.openManual(id);
      else setLocalOpenId(id);
    },
    [accordion],
  );
  const closeSlot = useCallback(
    (id: string): void => {
      if (accordion) accordion.close(id);
      else setLocalOpenId((current) => (current === id ? null : current));
    },
    [accordion],
  );

  const openAutoSlotRef = useRef(openAutoSlot);
  openAutoSlotRef.current = openAutoSlot;
  const prevWants = useRef(false);
  useEffect(() => {
    if (wantsOpenByDefault && !prevWants.current) {
      openAutoSlotRef.current(groupId);
    }
    prevWants.current = wantsOpenByDefault;
  }, [wantsOpenByDefault, groupId]);

  const [mounted, setMounted] = useState(isOpen);
  const [shown, setShown] = useState(isOpen);
  const raf2 = useRef(0);
  useEffect(() => {
    if (!isOpen) {
      setShown(false);
      const timer = setTimeout(() => setMounted(false), TOOLBOX_COLLAPSE_MS);
      return () => clearTimeout(timer);
    }
    setMounted(true);
    if (typeof requestAnimationFrame === "undefined") {
      setShown(true);
      return;
    }
    const raf1 = requestAnimationFrame(() => {
      raf2.current = requestAnimationFrame(() => setShown(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2.current) cancelAnimationFrame(raf2.current);
    };
  }, [isOpen]);

  const open = useCallback(() => {
    openManualSlot(groupId);
  }, [groupId, openManualSlot]);

  return {
    isOpen,
    mounted,
    shown,
    open,
    toggle: () => {
      if (isOpen) closeSlot(groupId);
      else openManualSlot(groupId);
    },
  };
}
