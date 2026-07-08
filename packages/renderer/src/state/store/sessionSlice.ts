import {
  createCurrentSessionPatch,
  resolveCurrentSessionSelection,
} from "../sessionStoreUpdate.js";
import {
  findSessionForSelection,
  loadLastSeenBySession,
  loadViewModeBySession,
  persistLastFocusedSession,
  preserveSelectedSessionRootMetadata,
  saveLastSeenBySession,
  saveViewModeBySession,
} from "../sessionPersistence.js";
import type { State } from "../storeTypes.js";
import type { StoreGet, StoreSet } from "./sliceTypes.js";

const NO_LOOSE_STRING_VALUES = {
  everything: "everything",
} as const;

type SessionSlice = Pick<
  State,
  | "token"
  | "sessions"
  | "currentSessionId"
  | "selectedPath"
  | "selectedPathId"
  | "activePath"
  | "activePathId"
  | "activeRevision"
  | "knownPaths"
  | "favorites"
  | "viewMode"
  | "viewModeBySession"
  | "lastSeenBySession"
  | "setToken"
  | "setSessions"
  | "setPathsState"
  | "setKnownPaths"
  | "setFavorites"
  | "setSelectedRoot"
  | "setCurrentSession"
  | "setViewMode"
  | "markSeen"
>;

export function createSessionSlice(
  set: StoreSet,
  get: StoreGet,
): SessionSlice {
  return {
    token: null,
    sessions: [],
    currentSessionId: null,
    selectedPath: null,
    selectedPathId: null,
    activePath: null,
    activePathId: null,
    activeRevision: 0,
    knownPaths: [],
    favorites: [],
    viewMode: NO_LOOSE_STRING_VALUES.everything,
    viewModeBySession: loadViewModeBySession(),
    lastSeenBySession: loadLastSeenBySession(),
    setToken: (token) => set({ token }),
    setSessions: (sessions) =>
      set((state) => {
        const currentSelectedSession = findSessionForSelection(
          state.sessions,
          state.currentSessionId,
          state.selectedPathId,
          state.selectedPath,
        );
        const nextSessions = preserveSelectedSessionRootMetadata(
          sessions,
          currentSelectedSession,
        );
        const selected = findSessionForSelection(
          nextSessions,
          state.currentSessionId,
          state.selectedPathId,
          state.selectedPath,
        );
        if (selected === undefined) return { sessions: nextSessions };
        return {
          sessions: nextSessions,
          selectedPath: selected.path ?? state.selectedPath,
          selectedPathId: selected.path_id ?? state.selectedPathId,
        };
      }),
    setPathsState: (p) =>
      set({
        activePath: p.activePath,
        activePathId: p.activePathId,
        activeRevision: p.activeRevision,
        knownPaths: p.knownPaths,
        favorites: p.favorites,
      }),
    setKnownPaths: (knownPaths) => set({ knownPaths }),
    setFavorites: (favorites) => set({ favorites }),
    setSelectedRoot: (selectedPath, selectedPathId) =>
      set({ selectedPath, selectedPathId }),
    setCurrentSession: (currentSessionId, root) => {
      const state = get();
      const selection = resolveCurrentSessionSelection(
        state,
        currentSessionId,
        root,
      );
      if (currentSessionId !== null) {
        persistLastFocusedSession(
          selection.selectedPathId,
          selection.selectedPath,
          currentSessionId,
        );
      }
      const patch = createCurrentSessionPatch(
        state,
        currentSessionId,
        selection,
      );
      if (patch !== null) set(patch);
    },
    setViewMode: (viewMode) => {
      const state = get();
      if (state.currentSessionId !== null) {
        const next = {
          ...state.viewModeBySession,
          [state.currentSessionId]: viewMode,
        };
        saveViewModeBySession(next);
        set({ viewMode, viewModeBySession: next });
      } else {
        set({ viewMode });
      }
    },
    markSeen: (filename) => {
      const state = get();
      const sid = state.currentSessionId;
      if (sid === null) return;
      const prev = state.lastSeenBySession[sid];
      if (prev !== undefined && prev >= filename) return;
      const next = { ...state.lastSeenBySession, [sid]: filename };
      saveLastSeenBySession(next);
      set({ lastSeenBySession: next });
    },
  };
}
