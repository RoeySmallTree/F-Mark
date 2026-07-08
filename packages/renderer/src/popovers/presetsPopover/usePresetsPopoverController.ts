import { useCallback, useMemo, useState } from "react";
import type { Preset } from "@f-mark/shared";
import { useStore } from "../../state/store.js";
import {
  loadCustomCategories,
  type CustomCategory,
} from "../customCategories.js";
import {
  loadCustomPresets,
  toPreset,
  type CustomPreset,
} from "../customPresets.js";
import {
  filterProjectPresets,
  groupPresetsByCategory,
} from "./model.js";
import type {
  PresetSection,
  PresetsPopoverController,
} from "./types.js";
import {
  useRemotePresets,
  type RemotePresetsState,
} from "./useRemotePresets.js";

const NO_LOOSE_STRING_VALUES = {
  custom: "custom",
} as const;

export function usePresetsPopoverController(
  onClose: () => void,
): PresetsPopoverController {
  const {
    token,
    sessionId,
    setComposeDraft,
    openPresetEditor,
    customPresetsVersion,
    customCategoriesVersion,
    activePath,
  } = usePresetsPopoverStoreBindings();
  const [query, setQuery] = useState("");
  const remote = useRemotePresets(token, sessionId);
  const custom = useCustomPresetList(customPresetsVersion);
  const categories = useCustomCategoryList(customCategoriesVersion);
  const listState = usePresetListState({
    categories,
    remote,
    custom,
    query,
    activePath,
  });
  const actions = usePresetsPopoverActions({
    setComposeDraft,
    openPresetEditor,
    onClose,
  });

  return {
    query,
    loading: remote.loading,
    error: remote.error,
    grouped: listState.grouped,
    filteredProject: listState.filteredProject,
    hasResults: listState.hasResults,
    onQueryChange: setQuery,
    onAddPreset: actions.onAddPreset,
    onEditPreset: actions.onEditPreset,
    onPick: actions.onPick,
  };
}

function usePresetListState({
  categories,
  remote,
  custom,
  query,
  activePath,
}: {
  categories: ReadonlyArray<CustomCategory>;
  remote: RemotePresetsState;
  custom: ReadonlyArray<Preset>;
  query: string;
  activePath: string | null;
}): {
  grouped: PresetSection[];
  filteredProject: Preset[];
  hasResults: boolean;
} {
  const grouped = useMemo(
    () =>
      groupPresetsByCategory({
        categories,
        builtin: remote.builtin,
        custom,
        query,
        activePath,
      }),
    [categories, remote.builtin, custom, query, activePath],
  );
  const filteredProject = useMemo(
    () => filterProjectPresets(remote.project, query, activePath),
    [remote.project, query, activePath],
  );

  return {
    grouped,
    filteredProject,
    hasResults: grouped.length > 0 || filteredProject.length > 0,
  };
}

function usePresetsPopoverActions({
  setComposeDraft,
  openPresetEditor,
  onClose,
}: {
  setComposeDraft(body: string): void;
  openPresetEditor(preset: CustomPreset | null): void;
  onClose(): void;
}): Pick<
  PresetsPopoverController,
  "onAddPreset" | "onEditPreset" | "onPick"
> {
  const onAddPreset = useCallback((): void => {
    openPresetEditor(null);
  }, [openPresetEditor]);

  const onEditPreset = useCallback(
    (preset: Preset): void => {
      if (preset.source !== NO_LOOSE_STRING_VALUES.custom) return;
      const match = loadCustomPresets().find((item) => item.id === preset.path);
      if (match === undefined) return;
      openPresetEditor(match);
    },
    [openPresetEditor],
  );

  const onPick = useCallback(
    (preset: Preset): void => {
      setComposeDraft(preset.body);
      onClose();
    },
    [setComposeDraft, onClose],
  );

  return { onAddPreset, onEditPreset, onPick };
}

function usePresetsPopoverStoreBindings(): {
  token: string | null;
  sessionId: string | null;
  setComposeDraft(body: string): void;
  openPresetEditor(preset: CustomPreset | null): void;
  customPresetsVersion: number;
  customCategoriesVersion: number;
  activePath: string | null;
} {
  const token = useStore((state) => state.token);
  const sessionId = useStore((state) => state.currentSessionId);
  const setComposeDraft = useStore((state) => state.setComposeDraft);
  const openPresetEditor = useStore((state) => state.openPresetEditor);
  const customPresetsVersion = useStore(
    (state) => state.customPresetsVersion,
  );
  const customCategoriesVersion = useStore(
    (state) => state.customCategoriesVersion,
  );
  const activePath = useStore((state) => state.activePath);

  return {
    token,
    sessionId,
    setComposeDraft,
    openPresetEditor,
    customPresetsVersion,
    customCategoriesVersion,
    activePath,
  };
}

function useCustomPresetList(version: number): Preset[] {
  return useMemo(() => loadCustomPresets().map(toPreset), [version]);
}

function useCustomCategoryList(version: number): CustomCategory[] {
  return useMemo(() => loadCustomCategories(), [version]);
}
