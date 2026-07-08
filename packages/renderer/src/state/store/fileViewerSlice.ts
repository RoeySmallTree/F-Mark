import {
  DEFAULT_FILE_VIEWER_DIFF,
  loadFileViewerActiveBySession,
  loadFileViewerTabsBySession,
  saveFileViewerActiveBySession,
  saveFileViewerTabsBySession,
  type FileViewerDiffState,
} from "../fileViewerPersistence.js";
import {
  FileViewerTabsController,
  type FileViewerTabMutation,
} from "../fileViewerTabs.js";
import type { State } from "../storeTypes.js";
import type { StoreGet, StoreSet } from "./sliceTypes.js";

type FileViewerSlice = Pick<
  State,
  | "fileViewerTabsBySession"
  | "fileViewerActiveBySession"
  | "fileViewerDiffBySession"
  | "gitDiffSettingsByPathId"
  | "gitChangedByPathId"
  | "gitRenamesByPathId"
  | "fileViewerModalOpen"
  | "openFile"
  | "closeFileTab"
  | "setFileViewerActive"
  | "togglePinFileTab"
  | "reorderFileTabs"
  | "setFileViewerDiff"
  | "setGitDiffSettings"
  | "setGitChangedFiles"
  | "setFileViewerModalOpen"
>;

function persistFileViewerTabMutation(
  mutation: FileViewerTabMutation,
): void {
  if (mutation.persistTabs !== undefined) {
    saveFileViewerTabsBySession(mutation.persistTabs);
  }
  if (mutation.persistActive !== undefined) {
    saveFileViewerActiveBySession(mutation.persistActive);
  }
}

export function createFileViewerSlice(
  set: StoreSet,
  get: StoreGet,
): FileViewerSlice {
  return {
    fileViewerTabsBySession: loadFileViewerTabsBySession(),
    fileViewerActiveBySession: loadFileViewerActiveBySession(),
    fileViewerDiffBySession: {},
    gitDiffSettingsByPathId: {},
    gitChangedByPathId: {},
    gitRenamesByPathId: {},
    fileViewerModalOpen: false,
    openFile: (absPath) => {
      const mutation = new FileViewerTabsController(get()).open(absPath);
      if (mutation === null) return;
      persistFileViewerTabMutation(mutation);
      set(mutation.patch);
    },
    closeFileTab: (absPath) => {
      const mutation = new FileViewerTabsController(get()).close(absPath);
      if (mutation === null) return;
      persistFileViewerTabMutation(mutation);
      set(mutation.patch);
    },
    setFileViewerActive: (absPath) => {
      const mutation = new FileViewerTabsController(get()).activate(absPath);
      if (mutation === null) return;
      persistFileViewerTabMutation(mutation);
      set(mutation.patch);
    },
    togglePinFileTab: (absPath) => {
      const mutation = new FileViewerTabsController(get()).togglePin(absPath);
      if (mutation === null) return;
      persistFileViewerTabMutation(mutation);
      set(mutation.patch);
    },
    reorderFileTabs: (fromPath, toPath) => {
      const mutation = new FileViewerTabsController(get()).reorder(
        fromPath,
        toPath,
      );
      if (mutation === null) return;
      persistFileViewerTabMutation(mutation);
      set(mutation.patch);
    },
    setFileViewerDiff: (absPath, patch, sessionKey) => {
      const s = get();
      const key = sessionKey ?? s.currentSessionId;
      if (key === null) return;
      const forSession = s.fileViewerDiffBySession[key] ?? {};
      const prev = forSession[absPath] ?? DEFAULT_FILE_VIEWER_DIFF;
      const nextEntry: FileViewerDiffState = { ...prev, ...patch };
      set({
        fileViewerDiffBySession: {
          ...s.fileViewerDiffBySession,
          [key]: { ...forSession, [absPath]: nextEntry },
        },
      });
    },
    setGitDiffSettings: (pathId, entry) => {
      const s = get();
      set({
        gitDiffSettingsByPathId: {
          ...s.gitDiffSettingsByPathId,
          [pathId]: entry,
        },
      });
    },
    setGitChangedFiles: (pathId, byRelPath, renamesOldToNew) => {
      const s = get();
      set({
        gitChangedByPathId: {
          ...s.gitChangedByPathId,
          [pathId]: byRelPath,
        },
        gitRenamesByPathId: {
          ...s.gitRenamesByPathId,
          [pathId]: renamesOldToNew ?? {},
        },
      });
    },
    setFileViewerModalOpen: (open) => set({ fileViewerModalOpen: open }),
  };
}
