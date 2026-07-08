import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import {
  loadCustomCategories,
  type CustomCategory,
} from "../../popovers/customCategories.js";
import {
  newCustomPresetId,
  removeCustomPreset,
  upsertCustomPreset,
  type CustomPreset,
} from "../../popovers/customPresets.js";
import { useStore } from "../../state/store.js";
import {
  newPresetDraft,
  presetForSave,
  selectedOrFallbackGroup,
  toggleStringSelection,
} from "./model.js";

export interface PresetDraftState {
  initialId: string;
  name: string;
  group: string;
  icon: string;
  body: string;
  workspaces: string[];
  setName: Dispatch<SetStateAction<string>>;
  setGroup: Dispatch<SetStateAction<string>>;
  setIcon: Dispatch<SetStateAction<string>>;
  setBody: Dispatch<SetStateAction<string>>;
  toggleWorkspace(path: string): void;
}

export interface PresetEditorUiState {
  emojiOpen: boolean;
  confirmingDelete: boolean;
  managingCategories: boolean;
  setEmojiOpen: Dispatch<SetStateAction<boolean>>;
  setConfirmingDelete: Dispatch<SetStateAction<boolean>>;
  setManagingCategories: Dispatch<SetStateAction<boolean>>;
}

export interface PresetEditorActions {
  onSave(): void;
  onDelete(): void;
  onKeyDown(event: KeyboardEvent<HTMLDivElement>): void;
}

export function useCustomCategoryList(): {
  categories: CustomCategory[];
  bumpCustomCategories(): void;
} {
  const bumpCustomCategories = useStore((state) => state.bumpCustomCategories);
  const customCategoriesVersion = useStore(
    (state) => state.customCategoriesVersion,
  );
  const categories = useMemo<CustomCategory[]>(
    () => loadCustomCategories(),
    [customCategoriesVersion],
  );
  return { categories, bumpCustomCategories };
}

export function usePresetDraft(
  editingPreset: CustomPreset | null,
  categories: ReadonlyArray<CustomCategory>,
): PresetDraftState {
  const initial = useMemo<CustomPreset>(
    () =>
      editingPreset ?? newPresetDraft(newCustomPresetId(), categories),
    [editingPreset, categories],
  );
  const [name, setName] = useState(initial.name);
  const [group, setGroup] = useState<string>(initial.group);
  const [icon, setIcon] = useState(initial.icon);
  const [body, setBody] = useState(initial.body);
  const [workspaces, setWorkspaces] = useState<string[]>(initial.workspaces);

  function toggleWorkspace(path: string): void {
    setWorkspaces((current) => toggleStringSelection(current, path));
  }

  return {
    initialId: initial.id,
    name,
    group,
    icon,
    body,
    workspaces,
    setName,
    setGroup,
    setIcon,
    setBody,
    toggleWorkspace,
  };
}

export function usePresetEditorUiState(): PresetEditorUiState {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [managingCategories, setManagingCategories] = useState(false);
  return {
    emojiOpen,
    confirmingDelete,
    managingCategories,
    setEmojiOpen,
    setConfirmingDelete,
    setManagingCategories,
  };
}

export function useAutoFocusedName(
  isNew: boolean,
): MutableRefObject<HTMLInputElement | null> {
  const nameRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (isNew) nameRef.current?.focus();
  }, [isNew]);
  return nameRef;
}

export function useSelectedCategoryFallback(
  categories: ReadonlyArray<CustomCategory>,
  group: string,
  setGroup: Dispatch<SetStateAction<string>>,
): void {
  useEffect(() => {
    const nextGroup = selectedOrFallbackGroup(categories, group);
    if (nextGroup !== null && nextGroup !== group) setGroup(nextGroup);
  }, [categories, group, setGroup]);
}

export function usePresetEditorActions({
  isNew,
  canSave,
  draft,
  closeModal,
  bumpCustomPresets,
}: {
  isNew: boolean;
  canSave: boolean;
  draft: PresetDraftState;
  closeModal(): void;
  bumpCustomPresets(): void;
}): PresetEditorActions {
  const onSave = useCallback((): void => {
    if (!canSave) return;
    upsertCustomPreset(
      presetForSave({
        id: draft.initialId,
        name: draft.name,
        group: draft.group,
        icon: draft.icon,
        body: draft.body,
        workspaces: draft.workspaces,
      }),
    );
    bumpCustomPresets();
    closeModal();
  }, [canSave, draft, bumpCustomPresets, closeModal]);

  const onDelete = useCallback((): void => {
    if (isNew) return;
    removeCustomPreset(draft.initialId);
    bumpCustomPresets();
    closeModal();
  }, [isNew, draft.initialId, bumpCustomPresets, closeModal]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>): void => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onSave();
      }
    },
    [onSave],
  );

  return { onSave, onDelete, onKeyDown };
}
