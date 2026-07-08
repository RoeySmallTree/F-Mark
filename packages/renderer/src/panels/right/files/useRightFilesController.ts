import { useCallback, useMemo, useState } from "react";
import { createClient } from "../../../api/client.js";
import type { FilesSearchState } from "../../../state/store.js";
import type { FavoriteScope, TreeView } from "./buildTreeView.js";
import { cycleFilesFavorite } from "./useRightFilesController/favoriteCycler.js";
import {
  resolveSelectedRoot,
  selectedRootScope,
} from "./useRightFilesController/rootScope.js";
import {
  useFilesTreeLoad,
  useProjectFavoritesLoad,
  useSessionFavoritesLoad,
} from "./useRightFilesController/useFilesLoadingEffects.js";
import { useRightFilesStoreSnapshot } from "./useRightFilesController/useRightFilesStoreSnapshot.js";
import { useFilesTreeViewState } from "./useRightFilesController/useFilesTreeViewState.js";

export interface RightFilesController {
  selectedPath: string | null;
  searchOpen: boolean;
  setSearchOpen(updater: boolean | ((current: boolean) => boolean)): void;
  search: FilesSearchState;
  loading: boolean;
  treeLoaded: boolean;
  view: TreeView;
  filterActive: boolean;
  chipsVisible: boolean;
  chromeHeight: number;
  resetFilesSearch(): void;
  onToggleFolder(relPath: string): void;
  cycleFav(absPath: string, current: FavoriteScope): Promise<void>;
}

export function useRightFilesController(): RightFilesController {
  const {
    activePath,
    activePathId,
    currentSessionId,
    filesExpandedByPath,
    filesFavoritesProjectByPath,
    filesFavoritesSession,
    filesSearch,
    filesTreeByPath,
    filesTreeLoadingByPath,
    resetFilesSearch,
    selectedPath,
    selectedPathId,
    setFilesFavoritesProject,
    setFilesFavoritesSession,
    toggleFilesFolder,
    token,
  } = useRightFilesStoreSnapshot();
  const [searchOpen, setSearchOpen] = useState(false);

  const client = useMemo(
    () => createClient({ baseUrl: "", token }),
    [token],
  );
  const selectedRoot = useMemo(
    () =>
      resolveSelectedRoot({
        selectedPath,
        selectedPathId,
        activePath,
        activePathId,
      }),
    [activePath, activePathId, selectedPath, selectedPathId],
  );
  const selectedRootPath = selectedRoot.path;
  const favScope = useMemo(
    () => selectedRootScope(selectedRoot.path, selectedRoot.pathId),
    [selectedRoot.path, selectedRoot.pathId],
  );

  useFilesTreeLoad(client, selectedRoot);
  useProjectFavoritesLoad({
    client,
    favScope,
    selectedRoot,
    setFilesFavoritesProject,
  });
  useSessionFavoritesLoad({
    client,
    currentSessionId,
    favScope,
    setFilesFavoritesSession,
  });

  const viewState = useFilesTreeViewState({
    selectedPath: selectedRootPath,
    currentSessionId,
    treeByPath: filesTreeByPath,
    loadingByPath: filesTreeLoadingByPath,
    expandedByPath: filesExpandedByPath,
    favProjectByPath: filesFavoritesProjectByPath,
    favSessionAll: filesFavoritesSession,
    search: filesSearch,
    searchOpen,
  });

  const onToggleFolder = useCallback(
    (relPath: string): void => {
      if (selectedRootPath !== null) {
        toggleFilesFolder(selectedRootPath, relPath);
      }
    },
    [selectedRootPath, toggleFilesFolder],
  );

  const cycleFav = useCallback(
    async (absPath: string, current: FavoriteScope): Promise<void> => {
      if (selectedRootPath === null) return;
      try {
        await cycleFilesFavorite(
          {
            client,
            currentSessionId,
            selectedPath: selectedRootPath,
            favScope,
            setFilesFavoritesProject,
            setFilesFavoritesSession,
          },
          absPath,
          current,
        );
      } catch (err) {
        console.error("cycleFav failed", err);
      }
    },
    [
      client,
      currentSessionId,
      favScope,
      selectedRootPath,
      setFilesFavoritesProject,
      setFilesFavoritesSession,
    ],
  );

  return {
    selectedPath: selectedRootPath,
    searchOpen,
    setSearchOpen,
    search: filesSearch,
    loading: viewState.loading,
    treeLoaded: viewState.treeLoaded,
    view: viewState.view,
    filterActive: viewState.filterActive,
    chipsVisible: viewState.chipsVisible,
    chromeHeight: viewState.chromeHeight,
    resetFilesSearch,
    onToggleFolder,
    cycleFav,
  };
}
