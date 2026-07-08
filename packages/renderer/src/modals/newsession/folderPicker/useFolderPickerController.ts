import {
  useCallback,
  useMemo,
} from "react";
import { createClient } from "../../../api/client.js";
import { useStore } from "../../../state/store.js";
import type {
  FolderPickerController,
  FolderPickerProps,
} from "./types.js";
import { useFavoriteController } from "./useFavoriteController.js";
import { useFolderListController } from "./useFolderListController.js";
import { useFolderPickerKeyboard } from "./useFolderPickerKeyboard.js";

export function useFolderPickerController(
  props: FolderPickerProps,
): FolderPickerController {
  const token = useStore((state) => state.token);
  const favorites = useStore((state) => state.favorites) ?? [];
  const setFavorites = useStore((state) => state.setFavorites);
  const client = useMemo(() => createClient({ baseUrl: "", token }), [token]);
  const list = useFolderListController({
    client,
    initialPath: props.initialPath,
    onPathChange: props.onPathChange,
  });
  const favorite = useFavoriteController({
    client,
    currentPath: list.state.path,
    favorites,
    setFavorites,
  });

  const onPickCurrent = useCallback(() => {
    props.onPick?.(list.state.path);
  }, [list.state.path, props.onPick]);

  const onKeyDown = useFolderPickerKeyboard({
    focusEntry: list.focusEntry,
    focusedIdx: list.focusedIdx,
    load: list.load,
    onPickCurrent,
    state: list.state,
  });

  return {
    ...favorite,
    ...list,
    hideActions: props.hideActions === true,
    onCancel: props.onCancel,
    onKeyDown,
    onPickCurrent,
  };
}
