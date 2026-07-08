import { useEffect } from "react";
import type { ModalKey } from "../../state/storeTypes.js";

const NO_LOOSE_STRING_VALUES = {
  esc: "Esc",
} as const;

export function useModalEscape(
  activeModal: ModalKey,
  closeModal: () => void,
): void {
  useEffect(() => {
    if (activeModal === null) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape" || e.key === NO_LOOSE_STRING_VALUES.esc) {
        e.preventDefault();
        e.stopPropagation();
        closeModal();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [activeModal, closeModal]);
}
