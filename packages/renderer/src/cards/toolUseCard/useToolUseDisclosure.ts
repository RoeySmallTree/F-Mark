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
import { TOOL_BODY_MAX_HEIGHT } from "./model.js";

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
  const [bodyExpanded, setBodyExpanded] = useState(false);
  const [bodyOverflowing, setBodyOverflowing] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const userToggledRef = useRef(false);

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
    open,
    setBodyExpanded,
    toggleOpen,
  };
}
