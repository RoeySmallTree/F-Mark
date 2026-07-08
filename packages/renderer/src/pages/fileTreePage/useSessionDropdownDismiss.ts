import { useEffect, type RefObject } from "react";

export function useSessionDropdownDismiss(
  open: boolean,
  dropdownRef: RefObject<HTMLElement>,
  closeDropdown: () => void,
): void {
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent): void {
      if (
        dropdownRef.current !== null &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        closeDropdown();
      }
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") closeDropdown();
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [closeDropdown, dropdownRef, open]);
}
