import { useMemo } from "react";
import { useStore } from "../../state/store.js";
import {
  categoryEmojiPool,
  canSavePreset,
} from "./model.js";
import {
  useAutoFocusedName,
  useCustomCategoryList,
  usePresetDraft,
  usePresetEditorActions,
  usePresetEditorUiState,
  useSelectedCategoryFallback,
} from "./controllerHooks.js";
import type { PresetEditorController } from "./types.js";

export function usePresetEditorController(): PresetEditorController {
  const editingPreset = useStore((state) => state.editingPreset);
  const closeModal = useStore((state) => state.closeModal);
  const bumpCustomPresets = useStore((state) => state.bumpCustomPresets);
  const isNew = editingPreset === null;
  const { categories, bumpCustomCategories } = useCustomCategoryList();
  const draft = usePresetDraft(editingPreset, categories);
  const ui = usePresetEditorUiState();
  const nameRef = useAutoFocusedName(isNew);

  useSelectedCategoryFallback(categories, draft.group, draft.setGroup);

  const categoryEmojis = useMemo<string[]>(
    () => categoryEmojiPool(categories, draft.group),
    [categories, draft.group],
  );
  const canSave = canSavePreset(draft.name, draft.body);
  const actions = usePresetEditorActions(
    { isNew, canSave, draft, closeModal, bumpCustomPresets },
  );

  return {
    isNew,
    categories,
    name: draft.name,
    group: draft.group,
    icon: draft.icon,
    body: draft.body,
    workspaces: draft.workspaces,
    emojiOpen: ui.emojiOpen,
    confirmingDelete: ui.confirmingDelete,
    managingCategories: ui.managingCategories,
    categoryEmojis,
    canSave,
    nameRef,
    closeModal,
    onSave: actions.onSave,
    onDelete: actions.onDelete,
    onKeyDown: actions.onKeyDown,
    toggleWorkspace: draft.toggleWorkspace,
    bumpCustomCategories,
    setName: draft.setName,
    setGroup: draft.setGroup,
    setIcon: draft.setIcon,
    setBody: draft.setBody,
    setEmojiOpen: ui.setEmojiOpen,
    setConfirmingDelete: ui.setConfirmingDelete,
    setManagingCategories: ui.setManagingCategories,
  };
}
