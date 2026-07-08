import { useShallow } from "zustand/react/shallow";
import { useStore } from "../../../../state/store.js";
import type { State } from "../../../../state/storeTypes.js";

type RightFilesStoreSnapshot = Pick<
  State,
  | "activePath"
  | "activePathId"
  | "currentSessionId"
  | "filesExpandedByPath"
  | "filesFavoritesProjectByPath"
  | "filesFavoritesSession"
  | "filesSearch"
  | "filesTreeByPath"
  | "filesTreeLoadingByPath"
  | "resetFilesSearch"
  | "selectedPath"
  | "selectedPathId"
  | "setFilesFavoritesProject"
  | "setFilesFavoritesSession"
  | "toggleFilesFolder"
  | "token"
>;

export function useRightFilesStoreSnapshot(): RightFilesStoreSnapshot {
  return useStore(
    useShallow((state): RightFilesStoreSnapshot => ({
      activePath: state.activePath,
      activePathId: state.activePathId,
      currentSessionId: state.currentSessionId,
      filesExpandedByPath: state.filesExpandedByPath,
      filesFavoritesProjectByPath: state.filesFavoritesProjectByPath,
      filesFavoritesSession: state.filesFavoritesSession,
      filesSearch: state.filesSearch,
      filesTreeByPath: state.filesTreeByPath,
      filesTreeLoadingByPath: state.filesTreeLoadingByPath,
      resetFilesSearch: state.resetFilesSearch,
      selectedPath: state.selectedPath,
      selectedPathId: state.selectedPathId,
      setFilesFavoritesProject: state.setFilesFavoritesProject,
      setFilesFavoritesSession: state.setFilesFavoritesSession,
      toggleFilesFolder: state.toggleFilesFolder,
      token: state.token,
    })),
  );
}
