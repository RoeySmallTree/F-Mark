import { useEffect } from "react";
import { toIsoTimestamp } from "@f-mark/shared";
import { createClient } from "../api/client.js";
import { rootScopeForSession, rootScopeKey } from "../api/rootScope.js";
import { eventsBaseKeyFor } from "../state/eventsBaseKey.js";
import { eventsMergeIntegrityOk } from "../state/eventsIntegrity.js";
import { mergeEvents } from "../state/mergeEvents.js";
import { getCachedEvents } from "../state/sessionEventsCache.js";
import {
  advanceCursor,
  clearSessionEventsCursor,
  loadSessionEventsCursor,
  readSince,
  saveSessionEventsCursor,
  type SessionEventsCursor,
  type SessionEventsCursorPathMeta,
} from "../state/sessionEventsCursor.js";
import { findSessionForSelection, useStore } from "../state/store.js";

const ROOT_SCOPE_PATH_ID_KEY = "pathId";
const INCREMENTAL_FETCH_RESULT = {
  applied: "applied",
  resync: "resync",
  stale: "stale",
} as const;

type EventRootScope = NonNullable<ReturnType<typeof rootScopeForSession>>;
type IncrementalFetchResult =
  (typeof INCREMENTAL_FETCH_RESULT)[keyof typeof INCREMENTAL_FETCH_RESULT];

function isPathIdScope(scope: EventRootScope): scope is { pathId: string } {
  return ROOT_SCOPE_PATH_ID_KEY in scope;
}

function eventPathForSelection(input: {
  session: ReturnType<typeof findSessionForSelection>;
  selectedPath: string | null;
}): string | undefined {
  return input.session?.path ?? input.selectedPath ?? undefined;
}

function scanTimestamp(): string {
  return toIsoTimestamp(new Date());
}

function cursorPathMetaFor(input: {
  scope: EventRootScope;
  sessionId: string;
  selectedPathId: string | null;
  selectedPath: string | null;
  eventPath: string | undefined;
}): SessionEventsCursorPathMeta {
  return {
    path_id:
      "pathId" in input.scope
        ? input.scope.pathId
        : (input.selectedPathId ?? input.scope.root),
    path:
      input.eventPath ??
      input.selectedPath ??
      ("root" in input.scope ? input.scope.root : ""),
    session_id: input.sessionId,
  };
}

function requestStillTargetsSelection(input: {
  cancelled: boolean;
  sessionId: string;
  selectedPathId: string | null;
  selectedPath: string | null;
  eventPath: string | undefined;
}): boolean {
  const state = useStore.getState();
  if (input.cancelled) return false;
  if (state.currentSessionId !== input.sessionId) return false;
  if (state.selectedPathId !== input.selectedPathId) return false;
  if (state.selectedPath !== input.selectedPath) return false;
  const nextPath = eventPathForSelection({
    session: findSessionForSelection(
      state.sessions,
      input.sessionId,
      state.selectedPathId,
      state.selectedPath,
    ),
    selectedPath: state.selectedPath,
  });
  return nextPath === input.eventPath;
}

function clearLoadingIfRequestCurrent(input: {
  cancelled: boolean;
  sessionId: string;
  selectedPathId: string | null;
  selectedPath: string | null;
  setEventsLoading(sessionId: string, loading: boolean): void;
}): void {
  const state = useStore.getState();
  if (input.cancelled) return;
  if (state.currentSessionId !== input.sessionId) return;
  if (state.selectedPathId !== input.selectedPathId) return;
  if (state.selectedPath !== input.selectedPath) return;
  input.setEventsLoading(input.sessionId, false);
}

async function fetchFullEventsForSelection(input: {
  client: ReturnType<typeof createClient>;
  sessionId: string;
  selectedPathId: string | null;
  selectedPath: string | null;
  eventPath: string | undefined;
  scope: EventRootScope;
  baseKey: string;
  pathMeta: SessionEventsCursorPathMeta;
  existingCursor: SessionEventsCursor | undefined;
  isCancelled(): boolean;
  setEvents: ReturnType<typeof useStore.getState>["setEvents"];
}): Promise<boolean> {
  const scanStartedAt = scanTimestamp();
  const events = await input.client.listEvents(input.sessionId, input.scope);
  if (
    !requestStillTargetsSelection({
      cancelled: input.isCancelled(),
      sessionId: input.sessionId,
      selectedPathId: input.selectedPathId,
      selectedPath: input.selectedPath,
      eventPath: input.eventPath,
    })
  ) {
    return false;
  }
  input.setEvents(events, input.baseKey);
  saveSessionEventsCursor(
    advanceCursor(
      input.existingCursor,
      events,
      scanStartedAt,
      input.pathMeta,
    ),
  );
  return true;
}

async function fetchIncrementalEventsForSelection(input: {
  client: ReturnType<typeof createClient>;
  sessionId: string;
  selectedPathId: string | null;
  selectedPath: string | null;
  eventPath: string | undefined;
  scope: EventRootScope;
  baseKey: string;
  pathMeta: SessionEventsCursorPathMeta;
  cursor: SessionEventsCursor;
  isCancelled(): boolean;
  mergeEvents: ReturnType<typeof useStore.getState>["mergeEvents"];
  setEventsLoading: ReturnType<typeof useStore.getState>["setEventsLoading"];
}): Promise<IncrementalFetchResult> {
  const scanStartedAt = scanTimestamp();
  const delta = await input.client.listEvents(input.sessionId, input.scope, {
    since: readSince(input.cursor),
  });
  if (
    !requestStillTargetsSelection({
      cancelled: input.isCancelled(),
      sessionId: input.sessionId,
      selectedPathId: input.selectedPathId,
      selectedPath: input.selectedPath,
      eventPath: input.eventPath,
    })
  ) {
    return INCREMENTAL_FETCH_RESULT.stale;
  }

  const current = useStore.getState();
  if (current.eventsBaseKey !== input.baseKey || current.events.length === 0) {
    return INCREMENTAL_FETCH_RESULT.resync;
  }
  const merged = mergeEvents(current.events, delta);
  if (!eventsMergeIntegrityOk(merged, delta)) {
    return INCREMENTAL_FETCH_RESULT.resync;
  }

  input.mergeEvents(delta, input.baseKey);
  saveSessionEventsCursor(
    advanceCursor(input.cursor, delta, scanStartedAt, input.pathMeta),
  );
  input.setEventsLoading(input.sessionId, false);
  return INCREMENTAL_FETCH_RESULT.applied;
}

async function loadEventsForSelection(input: {
  client: ReturnType<typeof createClient>;
  sessionId: string;
  selectedPathId: string | null;
  selectedPath: string | null;
  eventPath: string | undefined;
  scope: NonNullable<ReturnType<typeof rootScopeForSession>> | null;
  isCancelled(): boolean;
  setEvents: ReturnType<typeof useStore.getState>["setEvents"];
  mergeEvents: ReturnType<typeof useStore.getState>["mergeEvents"];
  setEventsLoading: ReturnType<typeof useStore.getState>["setEventsLoading"];
}): Promise<void> {
  if (input.scope === null) {
    input.setEventsLoading(input.sessionId, false);
    return;
  }
  try {
    const baseKey = eventsBaseKeyFor(input.scope, input.sessionId);
    const pathMeta = cursorPathMetaFor({
      scope: input.scope,
      sessionId: input.sessionId,
      selectedPathId: input.selectedPathId,
      selectedPath: input.selectedPath,
      eventPath: input.eventPath,
    });

    const cached = getCachedEvents(baseKey);
    const current = useStore.getState();
    if (
      cached !== undefined &&
      (current.eventsBaseKey !== baseKey || current.events.length === 0)
    ) {
      input.setEvents(cached, baseKey);
    }

    const warm = useStore.getState();
    const hasWarmBase = warm.eventsBaseKey === baseKey && warm.events.length > 0;
    const cursor = loadSessionEventsCursor(pathMeta.path_id, input.sessionId);
    if (!hasWarmBase || cursor === undefined) {
      await fetchFullEventsForSelection({
        client: input.client,
        sessionId: input.sessionId,
        selectedPathId: input.selectedPathId,
        selectedPath: input.selectedPath,
        eventPath: input.eventPath,
        scope: input.scope,
        baseKey,
        pathMeta,
        existingCursor: cursor,
        isCancelled: input.isCancelled,
        setEvents: input.setEvents,
      });
      return;
    }

    const incrementalResult = await fetchIncrementalEventsForSelection({
      client: input.client,
      sessionId: input.sessionId,
      selectedPathId: input.selectedPathId,
      selectedPath: input.selectedPath,
      eventPath: input.eventPath,
      scope: input.scope,
      baseKey,
      pathMeta,
      cursor,
      isCancelled: input.isCancelled,
      mergeEvents: input.mergeEvents,
      setEventsLoading: input.setEventsLoading,
    });
    if (incrementalResult !== INCREMENTAL_FETCH_RESULT.resync) return;

    clearSessionEventsCursor(pathMeta.path_id, input.sessionId);
    await fetchFullEventsForSelection({
      client: input.client,
      sessionId: input.sessionId,
      selectedPathId: input.selectedPathId,
      selectedPath: input.selectedPath,
      eventPath: input.eventPath,
      scope: input.scope,
      baseKey,
      pathMeta,
      existingCursor: undefined,
      isCancelled: input.isCancelled,
      setEvents: input.setEvents,
    });
  } catch (e) {
    // Do not clear events on a failed fetch. A path switch can leave an
    // old request racing a new one; the next matching request repopulates.
    clearLoadingIfRequestCurrent({
      cancelled: input.isCancelled(),
      sessionId: input.sessionId,
      selectedPathId: input.selectedPathId,
      selectedPath: input.selectedPath,
      setEventsLoading: input.setEventsLoading,
    });
  }
}

export function useSessionEvents(token: string | null): void {
  const setEvents = useStore((s) => s.setEvents);
  const mergeSessionEvents = useStore((s) => s.mergeEvents);
  const setEventsLoading = useStore((s) => s.setEventsLoading);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const selectedPath = useStore((s) => s.selectedPath);
  const selectedPathId = useStore((s) => s.selectedPathId);
  const scopeKey = useStore((s) => {
    if (s.currentSessionId === null) return "";
    const selectedSession = findSessionForSelection(
      s.sessions,
      s.currentSessionId,
      s.selectedPathId,
      s.selectedPath,
    );
    return rootScopeKey(
      rootScopeForSession(selectedSession, s.selectedPathId, s.selectedPath),
    );
  });

  useEffect(() => {
    if (currentSessionId === null) return;
    const client = createClient({ baseUrl: "", token });
    const sessionId = currentSessionId;
    const pathId = selectedPathId;
    const path = selectedPath;
    const state = useStore.getState();
    const selectedSession = findSessionForSelection(
      state.sessions,
      sessionId,
      selectedPathId,
      selectedPath,
    );
    const eventPath = eventPathForSelection({
      session: selectedSession,
      selectedPath,
    });
    const scope = rootScopeForSession(
      selectedSession,
      selectedPathId,
      selectedPath,
    );
    let cancelled = false;
    const initial = useStore.getState();
    const initialScope = rootScopeForSession(
      selectedSession,
      selectedPathId,
      selectedPath,
    );
    const initialBaseKey =
      initialScope !== null
        ? eventsBaseKeyFor(initialScope, sessionId)
        : null;
    const hasWarmBaseAlready =
      initialBaseKey !== null &&
      initial.eventsBaseKey === initialBaseKey &&
      initial.events.length > 0;
    if (!hasWarmBaseAlready) {
      setEventsLoading(sessionId, true);
    }
    void loadEventsForSelection({
      client,
      sessionId,
      selectedPathId: pathId,
      selectedPath: path,
      eventPath,
      scope,
      isCancelled: () => cancelled,
      setEvents,
      mergeEvents: mergeSessionEvents,
      setEventsLoading,
    });
    return () => {
      cancelled = true;
    };
  }, [
    currentSessionId,
    selectedPath,
    selectedPathId,
    scopeKey,
    token,
    setEvents,
    mergeSessionEvents,
    setEventsLoading,
  ]);
}
