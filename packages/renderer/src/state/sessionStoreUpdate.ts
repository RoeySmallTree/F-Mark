import type { AnyEventRecord } from "@f-mark/shared";
import type { SessionMeta } from "../api/client.js";
import { rootScopeForSession } from "../api/rootScope.js";
import { eventsBaseKeyFor } from "./eventsBaseKey.js";
import {
  DEFAULT_FILES_SEARCH,
  type FilesSearchState,
} from "./filesSearchState.js";
import {
  findSessionForSelection,
  type ViewMode,
} from "./sessionPersistence.js";
import { getCachedEvents } from "./sessionEventsCache.js";
import type { RightTabKey } from "./rightTabsConfig.js";

const NO_LOOSE_STRING_VALUES = {
  everything: "everything",
  log: "log",
} as const;

export interface CurrentSessionRootInput {
  path?: string;
  path_id?: string;
}

export interface CurrentSessionSelectionState {
  sessions: SessionMeta[];
  selectedPath: string | null;
  selectedPathId: string | null;
  activePath: string | null;
  activePathId: string | null;
}

export interface CurrentSessionSelection {
  selectedPath: string | null;
  selectedPathId: string | null;
}

export interface CurrentSessionPatchState
  extends CurrentSessionSelectionState {
  currentSessionId: string | null;
  viewModeBySession: Record<string, ViewMode>;
  rightTabBySession: Record<string, RightTabKey>;
}

export interface CurrentSessionPatch {
  currentSessionId: string | null;
  selectedPath: string | null;
  selectedPathId: string | null;
  events: AnyEventRecord[];
  eventsBaseKey: string | null;
  eventsLoadingSessionId: string | null;
  viewMode: ViewMode;
  rightTab: RightTabKey;
  followMode: true;
  filesSearch: FilesSearchState;
}

function selectedSessionForRoot(
  state: CurrentSessionSelectionState,
  sessionId: string,
  root: CurrentSessionRootInput | null | undefined,
): SessionMeta | undefined {
  return findSessionForSelection(
    state.sessions,
    sessionId,
    root?.path_id ?? state.selectedPathId,
    root?.path ?? state.selectedPath,
  );
}

export function resolveCurrentSessionSelection(
  state: CurrentSessionSelectionState,
  sessionId: string | null,
  root: CurrentSessionRootInput | null | undefined,
): CurrentSessionSelection {
  if (sessionId === null) {
    return {
      selectedPath: root?.path ?? state.selectedPath ?? state.activePath,
      selectedPathId:
        root?.path_id ?? state.selectedPathId ?? state.activePathId,
    };
  }
  const selectedSession = selectedSessionForRoot(state, sessionId, root);
  return {
    selectedPath: root?.path ?? selectedSession?.path ?? state.activePath,
    selectedPathId:
      root?.path_id ?? selectedSession?.path_id ?? state.activePathId,
  };
}

function cachedEventsForSelection(
  state: CurrentSessionPatchState,
  sessionId: string | null,
  selection: CurrentSessionSelection,
): { events: AnyEventRecord[]; baseKey: string } | null {
  if (sessionId === null) return null;
  const selectedSession = findSessionForSelection(
    state.sessions,
    sessionId,
    selection.selectedPathId,
    selection.selectedPath,
  );
  const scope = rootScopeForSession(
    selectedSession,
    selection.selectedPathId,
    selection.selectedPath,
  );
  if (scope === null) return null;
  const baseKey = eventsBaseKeyFor(scope, sessionId);
  const events = getCachedEvents(baseKey);
  return events === undefined ? null : { events, baseKey };
}

export function createCurrentSessionPatch(
  state: CurrentSessionPatchState,
  sessionId: string | null,
  selection: CurrentSessionSelection,
): CurrentSessionPatch | null {
  if (
    state.currentSessionId === sessionId &&
    state.selectedPathId === selection.selectedPathId &&
    state.selectedPath === selection.selectedPath
  ) {
    return null;
  }
  const cached = cachedEventsForSelection(state, sessionId, selection);
  return {
    currentSessionId: sessionId,
    selectedPath: selection.selectedPath,
    selectedPathId: selection.selectedPathId,
    events: cached?.events ?? [],
    eventsBaseKey: cached?.baseKey ?? null,
    eventsLoadingSessionId: cached !== null ? null : sessionId,
    viewMode:
      sessionId !== null
        ? (state.viewModeBySession[sessionId] ?? NO_LOOSE_STRING_VALUES.everything)
        : NO_LOOSE_STRING_VALUES.everything,
    rightTab:
      sessionId !== null ? (state.rightTabBySession[sessionId] ?? NO_LOOSE_STRING_VALUES.log) : NO_LOOSE_STRING_VALUES.log,
    followMode: true,
    filesSearch: DEFAULT_FILES_SEARCH,
  };
}
