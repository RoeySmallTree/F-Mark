import { useCallback, useRef, useState, type RefObject } from "react";
import { useSessionDropdownDismiss } from "./useSessionDropdownDismiss.js";

export interface FileTreeSessionDropdown {
  open: boolean;
  ref: RefObject<HTMLDivElement>;
  close(): void;
  toggle(): void;
}

export function useFileTreeSessionDropdown(): FileTreeSessionDropdown {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const close = useCallback((): void => {
    setOpen(false);
  }, []);

  const toggle = useCallback((): void => {
    setOpen((value) => !value);
  }, []);

  useSessionDropdownDismiss(open, ref, close);

  return { open, ref, close, toggle };
}
