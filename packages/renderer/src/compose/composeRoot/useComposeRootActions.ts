import { useCallback, type ChangeEvent, type MouseEvent } from "react";
import { composePlaceholder } from "../composeHelpers.js";
import { skillTriggerAt } from "../skillsTrigger.js";
import { useComposeKeyboard } from "../useComposeKeyboard.js";
import type {
  ComposeRootActions,
  ComposeRootCore,
  ComposeRootServices,
} from "./types.js";

const NO_LOOSE_STRING_VALUES = {
  message: "message",
  skills: "skills",
  named: "named",
} as const;

export function useComposeRootActions(
  core: ComposeRootCore,
  services: ComposeRootServices,
): ComposeRootActions {
  const { activeMode, setMode, settings, textDraft, popovers } = core;
  const { attachments, submission } = services;
  const { endTurn, endTurnAndWake, submitAndMaybeEndTurn, sendOrEndTurn } =
    submission;
  const {
    closeCreateTodo,
    closeSkillsPopover,
    openModal,
    openMentions,
    openPresets,
    openSkillsPopover,
    skillsAnchorRect,
    updateSkillsTrigger,
  } = popovers;

  const createTodoEndsTurn =
    activeMode === NO_LOOSE_STRING_VALUES.message && settings.messageEndsTurn;
  const onCreateTodoCreated = useCallback(async (): Promise<void> => {
    if (createTodoEndsTurn) await endTurn();
  }, [createTodoEndsTurn, endTurn]);
  const onOpenSkills = useCallback((): void => {
    closeCreateTodo();
    openModal(NO_LOOSE_STRING_VALUES.skills);
  }, [closeCreateTodo, openModal]);
  const openSkillsHotkey = useCallback((): void => {
    openModal(NO_LOOSE_STRING_VALUES.skills);
  }, [openModal]);
  const toggleNamed = useCallback((): void => {
    setMode(activeMode === NO_LOOSE_STRING_VALUES.named ? NO_LOOSE_STRING_VALUES.message : NO_LOOSE_STRING_VALUES.named);
  }, [activeMode, setMode]);

  const syncSkillsPopover = useCallback(
    (
      value: string,
      caret: number,
      options: { refresh: boolean } = { refresh: false },
    ): void => {
      const trigger = skillTriggerAt(value, caret);
      if (trigger === null) {
        if (skillsAnchorRect !== null) closeSkillsPopover();
        return;
      }
      closeCreateTodo();
      if (skillsAnchorRect === null || options.refresh) {
        openSkillsPopover(trigger);
        return;
      }
      updateSkillsTrigger(trigger);
    },
    [
      closeCreateTodo,
      closeSkillsPopover,
      openSkillsPopover,
      skillsAnchorRect,
      updateSkillsTrigger,
    ],
  );

  const onTextareaChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>): void => {
      textDraft.setContent(e.target.value);
      if (e.target.value.endsWith("@")) openMentions();
      syncSkillsPopover(e.target.value, e.target.selectionStart);
    },
    [openMentions, syncSkillsPopover, textDraft],
  );
  const onTextareaClick = useCallback(
    (e: MouseEvent<HTMLTextAreaElement>): void => {
      syncSkillsPopover(e.currentTarget.value, e.currentTarget.selectionStart, {
        refresh: true,
      });
    },
    [syncSkillsPopover],
  );
  const onTextareaKey = useComposeKeyboard({
    enterToSend: settings.enterToSend,
    busy: submission.busy,
    toggleNamed,
    openPresets,
    openSkills: openSkillsHotkey,
    sendOrEndTurn,
    handleEscape: textDraft.handleEscape,
  });
  const onSubmit = useCallback((): void => {
    void submitAndMaybeEndTurn();
  }, [submitAndMaybeEndTurn]);
  const onEndTurn = useCallback((): void => {
    void endTurnAndWake();
  }, [endTurnAndWake]);

  return {
    createTodoEndsTurn,
    placeholder: composePlaceholder(activeMode, attachments.draggingMode),
    onTextareaChange,
    onTextareaClick,
    onTextareaKey,
    onOpenSkills,
    onSubmit,
    onEndTurn,
    onCreateTodoCreated,
  };
}
