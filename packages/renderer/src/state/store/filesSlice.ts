import { DEFAULT_FILES_SEARCH } from "../filesSearchState.js";
import type { State } from "../storeTypes.js";
import type { StoreSet } from "./sliceTypes.js";

type FilesSlice = Pick<
  State,
  | "filesTreeByPath"
  | "filesTreeLoadingByPath"
  | "filesExpandedByPath"
  | "filesFavoritesProjectByPath"
  | "filesFavoritesSession"
  | "filesSearch"
  | "setFilesTree"
  | "setFilesTreeLoading"
  | "toggleFilesFolder"
  | "setFilesFavoritesProject"
  | "setFilesFavoritesSession"
  | "setFilesSearch"
  | "resetFilesSearch"
>;

export function createFilesSlice(set: StoreSet): FilesSlice {
  return {
    filesTreeByPath: {},
    filesTreeLoadingByPath: {},
    filesExpandedByPath: {},
    filesFavoritesProjectByPath: {},
    filesFavoritesSession: {},
    filesSearch: DEFAULT_FILES_SEARCH,
    setFilesTree: (path, tree) =>
      set((s) => ({
        filesTreeByPath: { ...s.filesTreeByPath, [path]: tree },
      })),
    setFilesTreeLoading: (path, loading) =>
      set((s) => ({
        filesTreeLoadingByPath: {
          ...s.filesTreeLoadingByPath,
          [path]: loading,
        },
      })),
    toggleFilesFolder: (path, relPath) =>
      set((s) => {
        const cur = s.filesExpandedByPath[path] ?? {};
        const next = { ...cur };
        if (next[relPath] === true) {
          delete next[relPath];
        } else {
          next[relPath] = true;
        }
        return {
          filesExpandedByPath: { ...s.filesExpandedByPath, [path]: next },
        };
      }),
    setFilesFavoritesProject: (path, list) =>
      set((s) => ({
        filesFavoritesProjectByPath: {
          ...s.filesFavoritesProjectByPath,
          [path]: list,
        },
      })),
    setFilesFavoritesSession: (sessionId, list) =>
      set((s) => ({
        filesFavoritesSession: {
          ...s.filesFavoritesSession,
          [sessionId]: list,
        },
      })),
    setFilesSearch: (patch) =>
      set((s) => ({ filesSearch: { ...s.filesSearch, ...patch } })),
    resetFilesSearch: () => set({ filesSearch: DEFAULT_FILES_SEARCH }),
  };
}
