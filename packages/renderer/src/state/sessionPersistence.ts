import type { SessionMeta } from "../api/client.js";
import { loadMap, loadStringMap, saveJson } from "./storagePersistence.js";

export type ViewMode = "everything" | "document" | "conversation";

export const VIEW_MODE_STORAGE_KEY = "fmark.viewModeBySession";
export const LAST_SEEN_STORAGE_KEY = "fmark.lastSeenBySession";
export const LAST_FOCUSED_SESSION_STORAGE_KEY =
  "fmark.lastFocusedSessionByPath";

const VIEW_MODES: ViewMode[] = ["everything", "document", "conversation"];

function isViewMode(value: unknown): value is ViewMode {
  return typeof value === "string" && (VIEW_MODES as string[]).includes(value);
}

export function loadViewModeBySession(): Record<string, ViewMode> {
  return loadMap(VIEW_MODE_STORAGE_KEY, (value) =>
    isViewMode(value) ? value : undefined,
  );
}

export function saveViewModeBySession(map: Record<string, ViewMode>): void {
  saveJson(VIEW_MODE_STORAGE_KEY, map);
}

export function loadLastSeenBySession(): Record<string, string> {
  return loadStringMap(LAST_SEEN_STORAGE_KEY);
}

export function saveLastSeenBySession(map: Record<string, string>): void {
  saveJson(LAST_SEEN_STORAGE_KEY, map);
}

function loadLastFocusedSessionByPath(): Record<string, string> {
  return loadStringMap(LAST_FOCUSED_SESSION_STORAGE_KEY, {
    requireNonEmpty: true,
  });
}

function saveLastFocusedSessionByPath(
  map: Record<string, string>,
): void {
  saveJson(LAST_FOCUSED_SESSION_STORAGE_KEY, map);
}

function focusPathKey(
  activePathId: string | null | undefined,
  activePath: string | null | undefined,
): string | null {
  if (typeof activePathId === "string" && activePathId.length > 0) {
    return `id:${activePathId}`;
  }
  if (typeof activePath === "string" && activePath.length > 0) {
    return `path:${activePath}`;
  }
  return null;
}

export function persistedLastFocusedSession(
  activePathId: string | null,
  activePath: string | null,
): string | null {
  const key = focusPathKey(activePathId, activePath);
  if (key === null) return null;
  return loadLastFocusedSessionByPath()[key] ?? null;
}

export function persistLastFocusedSession(
  activePathId: string | null,
  activePath: string | null,
  sessionId: string,
): void {
  const key = focusPathKey(activePathId, activePath);
  if (key === null) return;
  saveLastFocusedSessionByPath({
    ...loadLastFocusedSessionByPath(),
    [key]: sessionId,
  });
}

export function clearPersistedLastFocusedSession(
  activePathId: string | null,
  activePath: string | null,
): void {
  const key = focusPathKey(activePathId, activePath);
  if (key === null) return;
  const map = loadLastFocusedSessionByPath();
  if (map[key] === undefined) return;
  delete map[key];
  saveLastFocusedSessionByPath(map);
}

export interface FocusedSessionChoice {
  sessionId: string | null;
  savedSessionId: string | null;
  savedSessionMissing: boolean;
}

export function chooseFocusedSessionForPath(
  sessions: SessionMeta[],
  activePathId: string | null,
  activePath: string | null,
  currentSessionId: string | null,
  preferCurrent: boolean,
): FocusedSessionChoice {
  const savedSessionId = persistedLastFocusedSession(activePathId, activePath);
  const hasSession = (id: string | null): id is string =>
    id !== null && sessions.some((session) => session.id === id);

  if (preferCurrent && hasSession(currentSessionId)) {
    return {
      sessionId: currentSessionId,
      savedSessionId,
      savedSessionMissing:
        savedSessionId !== null && !hasSession(savedSessionId),
    };
  }

  if (hasSession(savedSessionId)) {
    return {
      sessionId: savedSessionId,
      savedSessionId,
      savedSessionMissing: false,
    };
  }

  if (hasSession(currentSessionId)) {
    return {
      sessionId: currentSessionId,
      savedSessionId,
      savedSessionMissing:
        savedSessionId !== null && !hasSession(savedSessionId),
    };
  }

  return {
    sessionId: sessions[0]?.id ?? null,
    savedSessionId,
    savedSessionMissing: savedSessionId !== null,
  };
}

function sessionMatchesRoot(
  session: SessionMeta,
  pathId: string | null | undefined,
  path: string | null | undefined,
): boolean {
  if (pathId !== null && pathId !== undefined) {
    return session.path_id === pathId;
  }
  if (path !== null && path !== undefined) {
    return session.path === path;
  }
  return true;
}

export function findSessionForSelection(
  sessions: SessionMeta[],
  sessionId: string | null,
  pathId: string | null,
  path: string | null,
): SessionMeta | undefined {
  if (sessionId === null) return undefined;
  return (
    sessions.find(
      (session) =>
        session.id === sessionId && sessionMatchesRoot(session, pathId, path),
    ) ?? sessions.find((session) => session.id === sessionId)
  );
}

function hasRootMetadata(session: SessionMeta): boolean {
  return (
    (typeof session.path_id === "string" && session.path_id.length > 0) ||
    (typeof session.path === "string" && session.path.length > 0)
  );
}

function preserveRootMetadata(
  incoming: SessionMeta,
  selected: SessionMeta,
): SessionMeta {
  if (hasRootMetadata(incoming)) return incoming;
  return {
    ...incoming,
    ...(selected.path !== undefined ? { path: selected.path } : {}),
    ...(selected.path_id !== undefined ? { path_id: selected.path_id } : {}),
  };
}

export function preserveSelectedSessionRootMetadata(
  incomingSessions: SessionMeta[],
  selectedSession: SessionMeta | undefined,
): SessionMeta[] {
  if (selectedSession === undefined || !hasRootMetadata(selectedSession)) {
    return incomingSessions;
  }

  let foundSelectedId = false;
  const sessions = incomingSessions.map((session) => {
    if (session.id !== selectedSession.id) return session;
    foundSelectedId = true;
    return preserveRootMetadata(session, selectedSession);
  });
  return foundSelectedId ? sessions : [...sessions, selectedSession];
}

export function chooseFocusedSessionAcrossPaths(
  sessions: SessionMeta[],
  currentSessionId: string | null,
  currentPathId: string | null,
  currentPath: string | null,
): SessionMeta | null {
  const current = findSessionForSelection(
    sessions,
    currentSessionId,
    currentPathId,
    currentPath,
  );
  if (current !== undefined) return current;
  for (const session of sessions) {
    if (
      persistedLastFocusedSession(
        session.path_id ?? null,
        session.path ?? null,
      ) === session.id
    ) {
      return session;
    }
  }
  return sessions[0] ?? null;
}
