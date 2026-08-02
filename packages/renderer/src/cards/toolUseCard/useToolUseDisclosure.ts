import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { ToolPresentation } from "../toolPresentation.js";
import { TOOL_BODY_MAX_HEIGHT, TOOL_DISCLOSURE_EXIT_MS } from "./model.js";

interface ToolUseDisclosureOptions {
  autoOpen: boolean | undefined;
  autoOpenRevision: string | undefined;
  eventFilename: string;
  initialOpen: boolean;
  presentation: ToolPresentation | null;
  result: unknown;
}

interface ToolUseDisclosure {
  bodyExpanded: boolean;
  bodyOverflowing: boolean;
  bodyRef: MutableRefObject<HTMLDivElement | null>;
  /** True for the brief window after `open` goes false, while the height
   *  transition plays. The body should stay mounted while this is true. */
  closing: boolean;
  open: boolean;
  setBodyExpanded: Dispatch<SetStateAction<boolean>>;
  toggleOpen: () => void;
}

export function useToolUseDisclosure({
  autoOpen,
  autoOpenRevision,
  eventFilename,
  initialOpen,
  presentation,
  result,
}: ToolUseDisclosureOptions): ToolUseDisclosure {
  const [open, setOpen] = useState(initialOpen);
  const [closing, setClosing] = useState(false);
  const [bodyExpanded, setBodyExpanded] = useState(false);
  const [bodyOverflowing, setBodyOverflowing] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const userToggledRef = useRef(false);
  const wasOpenRef = useRef(open);

  /* `open` is the single state every close path writes to — the manual
     toggle below and the external autoOpen effect both call setOpen, so this
     is the one place that needs to notice a close and start the exit timer.
     Closing only when we were actually open avoids animating the initial
     mount of a card that starts collapsed. */
  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;
    if (open) {
      setClosing(false);
      return;
    }
    if (!wasOpen) return;
    setClosing(true);
    const timer = setTimeout(() => setClosing(false), TOOL_DISCLOSURE_EXIT_MS);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    userToggledRef.current = false;
    setBodyExpanded(false);
    setBodyOverflowing(false);
  }, [eventFilename]);

  useEffect(() => {
    if (autoOpen === undefined) return;
    if (autoOpen || !userToggledRef.current) setOpen(autoOpen);
  }, [autoOpen, autoOpenRevision, eventFilename]);

  useLayoutEffect(() => {
    if (!open || presentation === null) return;
    const node = bodyRef.current;
    if (node === null) return;
    const refresh = (): void => {
      setBodyOverflowing(node.scrollHeight > TOOL_BODY_MAX_HEIGHT + 1);
    };
    refresh();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(refresh);
    observer.observe(node);
    return () => observer.disconnect();
  }, [
    open,
    result,
    presentation?.title,
    presentation?.summary,
    presentation?.sections.length,
  ]);

  const toggleOpen = useCallback(() => {
    userToggledRef.current = true;
    setOpen((current) => !current);
  }, []);

  return {
    bodyExpanded,
    bodyOverflowing,
    bodyRef,
    closing,
    open,
    setBodyExpanded,
    toggleOpen,
  };
}
