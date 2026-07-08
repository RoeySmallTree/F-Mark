import type {
  AnyEventRecord,
  DiffBase,
  GitFileStatus,
  LineContext,
  ManagedAgentWsMessage,
  Participant,
  SkillRef,
} from "@f-mark/shared";
import type {
  FilesTreeResponse,
  PathFavorite,
  SessionMeta,
} from "../api/client.js";
import type { CustomPreset } from "../popovers/customPresets.js";
import type { LogFilter } from "../popovers/log-filter-types.js";
import type { FilesSearchState } from "./filesSearchState.js";
import type {
  FileViewerDiffState,
  GitDiffSettingsCacheEntry,
  OpenFileTab,
  PendingFileReveal,
} from "./fileViewerPersistence.js";
import type { PanelId, SessionPaneSizes } from "./panePersistence.js";
import type { PresenceSlice } from "./presence.js";
import type {
  RightPanelView,
  RightTabConfig,
  RightTabKey,
} from "./rightTabsConfig.js";
import type { ViewMode } from "./sessionPersistence.js";

export type LeftRailKey =
  | "sessions"
  | "named"
  | "todos"
  | "comments"
  | "search";

/** What the user is inspecting comments for. Discriminated so a repo-file
 *  comment target (`kind: "file"`, a `file_path`) is never confused with an
 *  event-anchored comment target (`kind: "event"`, an event filename used as a
 *  DOM/scroll selector). */
export type CommentTarget =
  | { kind: "event"; file: string; lines?: [number, number] }
  | {
      kind: "file";
      file_path: string;
      lines?: [number, number];
      diff_hunk?: string;
      diff_base?: DiffBase;
      line_context?: LineContext;
    };

export type SettingsSectionKey =
  | "profile"
  | "agents"
  | "runtimes"
  | "hooks"
  | "appearance"
  | "git-diff"
  | "shortcuts"
  | "about";

export type ModalKey =
  | null
  | "new-session"
  | "settings"
  | "cmdk"
  | "presets"
  | "skills"
  | "log-filter"
  | "preset-editor"
  | "skill-editor"
  | "html-preview";

export interface HtmlPreviewModalState {
  sessionId: string;
  filename: string;
  title: string;
  mode: "preview" | "source";
}

export interface ComposeInsertion {
  text: string;
  nonce: number;
}

export type PopoverKey =
  | null
  | "log-filter"
  | "presets"
  | "skills"
  | "compose-settings";

export interface PopoverState {
  key: PopoverKey;
  anchorRect: DOMRect | null;
}

export interface State extends PresenceSlice {
  token: string | null;
  sessions: SessionMeta[];
  currentSessionId: string | null;
  selectedPath: string | null;
  selectedPathId: string | null;
  participants: Record<string, Participant>;
  currentUserId: string | null;
  events: AnyEventRecord[];
  eventsBaseKey: string | null;
  eventsLoadingSessionId: string | null;
  activePath: string | null;
  activePathId: string | null;
  activeRevision: number;
  knownPaths: string[];
  favorites: PathFavorite[];
  composeMode: "message" | "named" | "comment";
  commentTarget: CommentTarget | null;
  pendingFileReveal: PendingFileReveal | null;
  focusedCommentId: string | null;
  composeDraft: string | null;
  composeInsertion: ComposeInsertion | null;
  leftRail: LeftRailKey;
  rightTab: RightPanelView;
  rightTabsConfig: RightTabConfig;
  rightTabsConfigBySession: Record<string, RightTabConfig>;
  viewMode: ViewMode;
  viewModeBySession: Record<string, ViewMode>;
  lastSeenBySession: Record<string, string>;
  followMode: boolean;
  scrollToBottomTick: number;
  panelSizeBySession: Record<string, SessionPaneSizes>;
  rightTabBySession: Record<string, RightTabKey>;
  rightScrollBySession: Record<string, number>;
  activeModal: ModalKey;
  settingsSection: SettingsSectionKey;
  editingPreset: CustomPreset | null;
  editingSkill: SkillRef | null;
  htmlPreview: HtmlPreviewModalState | null;
  customPresetsVersion: number;
  customCategoriesVersion: number;
  activePopover: PopoverState;
  logFilter: LogFilter;
  managedAgentsDisabledReason: string | null;
  filesTreeByPath: Record<string, FilesTreeResponse | null>;
  filesTreeLoadingByPath: Record<string, boolean>;
  filesExpandedByPath: Record<string, Record<string, true>>;
  filesFavoritesProjectByPath: Record<string, string[]>;
  filesFavoritesSession: Record<string, string[]>;
  filesSearch: FilesSearchState;
  fileViewerTabsBySession: Record<string, OpenFileTab[]>;
  fileViewerActiveBySession: Record<string, string>;
  fileViewerDiffBySession: Record<string, Record<string, FileViewerDiffState>>;
  gitDiffSettingsByPathId: Record<string, GitDiffSettingsCacheEntry>;
  gitChangedByPathId: Record<string, Record<string, GitFileStatus>>;
  gitRenamesByPathId: Record<string, Record<string, string>>;
  fileViewerModalOpen: boolean;
  setToken(token: string | null): void;
  setSessions(sessions: SessionMeta[]): void;
  setPathsState(paths: {
    activePath: string | null;
    activePathId: string | null;
    activeRevision: number;
    knownPaths: string[];
    favorites: PathFavorite[];
  }): void;
  setKnownPaths(paths: string[]): void;
  setFavorites(favorites: PathFavorite[]): void;
  setSelectedRoot(path: string | null, pathId: string | null): void;
  setCurrentSession(
    id: string | null,
    root?: { path?: string; path_id?: string } | null,
  ): void;
  setParticipants(participants: Record<string, Participant>): void;
  upsertParticipant(id: string, participant: Participant): void;
  setCurrentUserId(id: string | null): void;
  setEvents(events: AnyEventRecord[], baseKey?: string | null): void;
  setEventsLoading(sessionId: string, loading: boolean): void;
  mergeEvents(delta: AnyEventRecord[], baseKey: string): void;
  upsertEvent(event: AnyEventRecord): void;
  setComposeMode(mode: "message" | "named" | "comment"): void;
  setCommentTarget(target: CommentTarget | null): void;
  requestFileReveal(
    absPath: string,
    line: number,
    opts?: { lineContext?: LineContext; lines?: [number, number] },
  ): void;
  clearFileReveal(): void;
  setFocusedCommentId(id: string | null): void;
  setComposeDraft(draft: string | null): void;
  requestComposeInsertion(text: string): void;
  clearComposeInsertion(): void;
  setLeftRail(value: LeftRailKey): void;
  setRightTab(value: RightPanelView): void;
  setRightTabsConfig(config: RightTabConfig): void;
  setRightTabsConfigForSession(config: RightTabConfig): void;
  clearRightTabsConfigForSessionOverride(): void;
  setViewMode(value: ViewMode): void;
  setPaneSize(pane: PanelId, axis: "width" | "height", px: number): void;
  setRightScroll(scrollTop: number): void;
  markSeen(filename: string): void;
  setFollowMode(value: boolean): void;
  requestScrollToBottom(): void;
  openModal(key: ModalKey): void;
  openSettings(section?: SettingsSectionKey): void;
  setSettingsSection(section: SettingsSectionKey): void;
  closeModal(): void;
  openPresetEditor(preset: CustomPreset | null): void;
  openSkillEditor(skill: SkillRef): void;
  openHtmlPreview(payload: HtmlPreviewModalState): void;
  bumpCustomPresets(): void;
  bumpCustomCategories(): void;
  openPopover(key: PopoverKey, anchorRect: DOMRect | null): void;
  closePopover(): void;
  setLogFilter(filter: LogFilter): void;
  setManagedAgentsDisabledReason(reason: string | null): void;
  setFilesTree(path: string, tree: FilesTreeResponse | null): void;
  setFilesTreeLoading(path: string, loading: boolean): void;
  toggleFilesFolder(path: string, relPath: string): void;
  setFilesFavoritesProject(path: string, list: string[]): void;
  setFilesFavoritesSession(sessionId: string, list: string[]): void;
  setFilesSearch(patch: Partial<FilesSearchState>): void;
  resetFilesSearch(): void;
  openFile(absPath: string): void;
  closeFileTab(absPath: string): void;
  setFileViewerActive(absPath: string | null): void;
  togglePinFileTab(absPath: string): void;
  reorderFileTabs(fromPath: string, toPath: string): void;
  setFileViewerDiff(
    absPath: string,
    patch: Partial<FileViewerDiffState>,
    sessionKey?: string,
  ): void;
  setGitDiffSettings(pathId: string, entry: GitDiffSettingsCacheEntry): void;
  setGitChangedFiles(
    pathId: string,
    byRelPath: Record<string, GitFileStatus>,
    renamesOldToNew?: Record<string, string>,
  ): void;
  setFileViewerModalOpen(open: boolean): void;
  rehydrateNamespacedSlices(): void;
  dispatchManagedAgentWsMessage(msg: ManagedAgentWsMessage): void;
}
