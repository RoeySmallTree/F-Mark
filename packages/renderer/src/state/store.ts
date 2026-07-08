import { create } from "zustand";
import { createPresenceSlice } from "./presence.js";
import { createComposeSlice } from "./store/composeSlice.js";
import { createEventsSlice } from "./store/eventsSlice.js";
import { createFilesSlice } from "./store/filesSlice.js";
import { createFileViewerSlice } from "./store/fileViewerSlice.js";
import { createManagedAgentsSlice } from "./store/managedAgentsSlice.js";
import { createNamespaceSlice } from "./store/namespaceSlice.js";
import { createParticipantsSlice } from "./store/participantsSlice.js";
import { createSessionSlice } from "./store/sessionSlice.js";
import { createUiSlice } from "./store/uiSlice.js";
import type { State } from "./storeTypes.js";

export {
  DEFAULT_FILES_SEARCH,
  type FilesSearchState,
} from "./filesSearchState.js";
export {
  DEFAULT_FILE_VIEWER_DIFF,
  type FileViewerDiffMode,
  type FileViewerDiffState,
  type FileViewerDiffStyle,
  type GitDiffSettingsCacheEntry,
  type OpenFileTab,
  type PendingFileReveal,
} from "./fileViewerPersistence.js";
export {
  defaultPaneSizes,
  PANE_MAX_HEIGHT,
  PANE_MAX_WIDTH,
  PANE_MIN_HEIGHT,
  PANE_MIN_WIDTH,
  type PanelId,
  type SessionPaneSizes,
} from "./panePersistence.js";
export {
  chooseFocusedSessionAcrossPaths,
  chooseFocusedSessionForPath,
  clearPersistedLastFocusedSession,
  findSessionForSelection,
  LAST_FOCUSED_SESSION_STORAGE_KEY,
  LAST_SEEN_STORAGE_KEY,
  loadViewModeBySession,
  persistedLastFocusedSession,
  preserveSelectedSessionRootMetadata,
  VIEW_MODE_STORAGE_KEY,
  type FocusedSessionChoice,
  type ViewMode,
} from "./sessionPersistence.js";
export {
  DEFAULT_RIGHT_TABS_CONFIG,
  isOnlyEnabledRightTab,
  reorderRightTabsConfig,
  resolveRightTabsConfig,
  RIGHT_TABS_CONFIG_BY_SESSION_STORAGE_KEY,
  RIGHT_TABS_CONFIG_STORAGE_KEY,
  toggleRightTabsConfig,
  type RightPanelView,
  type RightTabConfig,
  type RightTabConfigEntry,
  type RightTabKey,
} from "./rightTabsConfig.js";
export type {
  CommentTarget,
  HtmlPreviewModalState,
  LeftRailKey,
  ModalKey,
  PopoverKey,
  PopoverState,
  SettingsSectionKey,
} from "./storeTypes.js";

export const useStore = create<State>((set, get) => ({
  ...createPresenceSlice<State>(set),
  ...createSessionSlice(set, get),
  ...createParticipantsSlice(set),
  ...createEventsSlice(set),
  ...createComposeSlice(set),
  ...createUiSlice(set, get),
  ...createManagedAgentsSlice(set, get),
  ...createFilesSlice(set),
  ...createFileViewerSlice(set, get),
  ...createNamespaceSlice(set),
}));
