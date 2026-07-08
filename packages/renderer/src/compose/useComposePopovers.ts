import {
  useCallback,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
} from "react";
import { useStore } from "../state/store.js";
import type { SkillTrigger } from "./skillsTrigger.js";

const NO_LOOSE_STRING_VALUES = {
  presets: "presets",
  composeSettings: "compose-settings",
} as const;

interface UseComposePopoversOptions {
  sessionId: string | null;
  textareaRef: RefObject<HTMLTextAreaElement>;
}

export interface ComposePopoverState {
  activePopover: ReturnType<typeof useStore.getState>["activePopover"];
  presetsBtnRef: React.MutableRefObject<HTMLButtonElement | null>;
  mentionBtnRef: React.MutableRefObject<HTMLButtonElement | null>;
  forkBtnRef: React.MutableRefObject<HTMLButtonElement | null>;
  createTodoBtnRef: React.MutableRefObject<HTMLButtonElement | null>;
  settingsBtnRef: React.MutableRefObject<HTMLButtonElement | null>;
  mentionAnchorRect: DOMRect | null;
  createTodoAnchorRect: DOMRect | null;
  forkAnchorRect: DOMRect | null;
  skillsAnchorRect: DOMRect | null;
  skillsTrigger: SkillTrigger | null;
  skillsRefreshKey: number;
  closePopover(): void;
  openModal(modal: Parameters<ReturnType<typeof useStore.getState>["openModal"]>[0]): void;
  openPresets(): void;
  openSettings(e: MouseEvent): void;
  openCreateTodo(): void;
  closeCreateTodo(): void;
  openFork(): void;
  closeFork(): void;
  openMentions(): void;
  closeMentions(): void;
  openSkillsPopover(trigger: SkillTrigger | null): void;
  updateSkillsTrigger(trigger: SkillTrigger | null): void;
  closeSkillsPopover(): void;
}

export function useComposePopovers({
  sessionId,
  textareaRef,
}: UseComposePopoversOptions): ComposePopoverState {
  const activePopover = useStore((s) => s.activePopover);
  const openPopover = useStore((s) => s.openPopover);
  const closePopover = useStore((s) => s.closePopover);
  const openModal = useStore((s) => s.openModal);
  const presetsBtnRef = useRef<HTMLButtonElement | null>(null);
  const mentionBtnRef = useRef<HTMLButtonElement | null>(null);
  const forkBtnRef = useRef<HTMLButtonElement | null>(null);
  const createTodoBtnRef = useRef<HTMLButtonElement | null>(null);
  const settingsBtnRef = useRef<HTMLButtonElement | null>(null);
  const [mentionAnchorRect, setMentionAnchorRect] = useState<DOMRect | null>(
    null,
  );
  const [createTodoAnchorRect, setCreateTodoAnchorRect] =
    useState<DOMRect | null>(null);
  const [forkAnchorRect, setForkAnchorRect] = useState<DOMRect | null>(null);
  const [skillsAnchorRect, setSkillsAnchorRect] = useState<DOMRect | null>(
    null,
  );
  const [skillsTrigger, setSkillsTrigger] = useState<SkillTrigger | null>(null);
  const [skillsRefreshKey, setSkillsRefreshKey] = useState(0);

  const openPresets = useCallback((): void => {
    const rect = presetsBtnRef.current?.getBoundingClientRect() ?? null;
    setCreateTodoAnchorRect(null);
    setSkillsAnchorRect(null);
    openPopover(NO_LOOSE_STRING_VALUES.presets, rect);
  }, [openPopover]);

  const openSettings = useCallback(
    (e: MouseEvent): void => {
      e.stopPropagation();
      if (activePopover.key === NO_LOOSE_STRING_VALUES.composeSettings) {
        closePopover();
        return;
      }
      const rect = settingsBtnRef.current?.getBoundingClientRect() ?? null;
      setCreateTodoAnchorRect(null);
      setSkillsAnchorRect(null);
      openPopover(NO_LOOSE_STRING_VALUES.composeSettings, rect);
    },
    [activePopover.key, closePopover, openPopover],
  );

  const openCreateTodo = useCallback((): void => {
    const rect = createTodoBtnRef.current?.getBoundingClientRect() ?? null;
    closePopover();
    setCreateTodoAnchorRect(rect);
    setForkAnchorRect(null);
    setSkillsAnchorRect(null);
  }, [closePopover]);

  const closeCreateTodo = useCallback((): void => {
    setCreateTodoAnchorRect(null);
  }, []);

  const openFork = useCallback((): void => {
    if (sessionId === null) return;
    const rect = forkBtnRef.current?.getBoundingClientRect() ?? null;
    closePopover();
    setCreateTodoAnchorRect(null);
    setForkAnchorRect(rect);
    setSkillsAnchorRect(null);
  }, [closePopover, sessionId]);

  const closeFork = useCallback((): void => {
    setForkAnchorRect(null);
  }, []);

  const openMentions = useCallback((): void => {
    const rect =
      mentionBtnRef.current?.getBoundingClientRect() ??
      textareaRef.current?.getBoundingClientRect() ??
      null;
    closePopover();
    setCreateTodoAnchorRect(null);
    setSkillsAnchorRect(null);
    setMentionAnchorRect(rect);
  }, [closePopover, textareaRef]);

  const closeMentions = useCallback((): void => {
    setMentionAnchorRect(null);
  }, []);

  const openSkillsPopover = useCallback(
    (trigger: SkillTrigger | null): void => {
      const rect = textareaRef.current?.getBoundingClientRect() ?? null;
      closePopover();
      setCreateTodoAnchorRect(null);
      setForkAnchorRect(null);
      setMentionAnchorRect(null);
      setSkillsTrigger(trigger);
      setSkillsAnchorRect(rect);
      setSkillsRefreshKey((value) => value + 1);
    },
    [closePopover, textareaRef],
  );

  const updateSkillsTrigger = useCallback(
    (trigger: SkillTrigger | null): void => {
      setSkillsTrigger(trigger);
    },
    [],
  );

  const closeSkillsPopover = useCallback((): void => {
    setSkillsAnchorRect(null);
    setSkillsTrigger(null);
  }, []);

  return {
    activePopover,
    presetsBtnRef,
    mentionBtnRef,
    forkBtnRef,
    createTodoBtnRef,
    settingsBtnRef,
    mentionAnchorRect,
    createTodoAnchorRect,
    forkAnchorRect,
    skillsAnchorRect,
    skillsTrigger,
    skillsRefreshKey,
    closePopover,
    openModal,
    openPresets,
    openSettings,
    openCreateTodo,
    closeCreateTodo,
    openFork,
    closeFork,
    openMentions,
    closeMentions,
    openSkillsPopover,
    updateSkillsTrigger,
    closeSkillsPopover,
  };
}
