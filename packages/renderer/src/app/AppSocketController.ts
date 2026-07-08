import {
  toIsoTimestamp,
  type AnyEventRecord,
  type ManagedAgentWsMessage,
  type Participant,
  type SessionMeta,
} from "@f-mark/shared";
import { createClient, type Client, type PathsResponse } from "../api/client.js";
import { rootScopeForSession, type RootScope } from "../api/rootScope.js";
import { loadFilesTree } from "../panels/right/files/filesTreeLoader.js";
import { loadGitChangedFiles } from "../panels/right/files/loadGitChangedFiles.js";
import {
  chooseFocusedSessionAcrossPaths,
  findSessionForSelection,
} from "../state/store.js";
import { eventsBaseKeyFor } from "../state/eventsBaseKey.js";
import { eventsMergeIntegrityOk } from "../state/eventsIntegrity.js";
import { mergeEvents as mergeEventRecords } from "../state/mergeEvents.js";
import {
  advanceCursor,
  clearSessionEventsCursor,
  loadSessionEventsCursor,
  readSince,
  saveSessionEventsCursor,
  type SessionEventsCursorPathMeta,
} from "../state/sessionEventsCursor.js";
import type { BusMessage, FilesChangedBusMessage } from "../types.js";
import { isManagedAgentMessage } from "./managedAgentMessages.js";

const NO_LOOSE_STRING_VALUES = {
  pathSwitched: "path-switched",
  pathsUpdated: "paths-updated",
  eventAdded: "event_added",
  eventSuperseded: "event_superseded",
} as const;

const EVENT_SUPERSEDED_REFRESH_DELAY_MS = 75;

interface AppSocketStoreSnapshot {
  activePath: string | null;
  activePathId: string | null;
  activeRevision: number;
  currentSessionId: string | null;
  selectedPath: string | null;
  selectedPathId: string | null;
  sessions: SessionMeta[];
  events: AnyEventRecord[];
  eventsBaseKey: string | null;
}

interface AppSocketControllerInput {
  token: string | null;
  getState(): AppSocketStoreSnapshot;
  setPathsState(
    paths: Pick<
      PathsResponse,
      "activePath" | "activePathId" | "activeRevision" | "knownPaths" | "favorites"
    >,
  ): void;
  setSessions(sessions: SessionMeta[]): void;
  setParticipants(participants: Record<string, Participant>): void;
  setCurrentSession(
    id: string | null,
    root?: { path?: string; path_id?: string } | null,
  ): void;
  setEvents(events: AnyEventRecord[], baseKey?: string | null): void;
  mergeEvents(delta: AnyEventRecord[], baseKey: string): void;
  dispatchManagedAgentWsMessage(message: ManagedAgentWsMessage): void;
}

function messageTargetsStalePath(
  message: BusMessage,
  state: AppSocketStoreSnapshot,
): boolean {
  return (
    "pathId" in message &&
    message.pathId != null &&
    state.selectedPathId != null &&
    message.pathId !== state.selectedPathId
  );
}

function messageIsStaleRevision(
  message: BusMessage,
  state: AppSocketStoreSnapshot,
): boolean {
  const revision = "revision" in message ? message.revision : undefined;
  if (typeof revision !== "number") return false;
  const sameActivePath =
    "pathId" in message ? message.pathId === state.activePathId : true;
  return sameActivePath && revision < state.activeRevision;
}

function selectedEventPath(input: {
  state: AppSocketStoreSnapshot;
  sessionId: string;
}): string | undefined {
  return (
    findSessionForSelection(
      input.state.sessions,
      input.sessionId,
      input.state.selectedPathId,
      input.state.selectedPath,
    )?.path ??
    input.state.selectedPath ??
    undefined
  );
}

function scanTimestamp(): string {
  return toIsoTimestamp(new Date());
}

function cursorPathMetaFor(input: {
  scope: RootScope;
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

function forkedSessionIdentity(
  session: unknown,
): { id: string; pathId?: string } | null {
  if (session === null || typeof session !== "object") return null;
  const candidate = session as Record<string, unknown>;
  if (typeof candidate.id !== "string" || candidate.id.length === 0) {
    return null;
  }
  return {
    id: candidate.id,
    ...(typeof candidate.path_id === "string" && candidate.path_id.length > 0
      ? { pathId: candidate.path_id }
      : {}),
  };
}

export class AppSocketController {
  private readonly client: Client;
  private readonly supersededRefreshTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  constructor(private readonly input: AppSocketControllerInput) {
    this.client = createClient({ baseUrl: "", token: input.token });
  }

  dispose(): void {
    for (const timer of this.supersededRefreshTimers.values()) {
      clearTimeout(timer);
    }
    this.supersededRefreshTimers.clear();
  }

  async handleMessage(message: BusMessage): Promise<void> {
    if (await this.handlePathRegistryMessage(message)) return;
    if (this.shouldDropForCurrentView(message)) return;
    if (this.handleGlobalMessage(message)) return;
    await this.handleSessionMessage(message);
  }

  async backfillCurrentView(): Promise<void> {
    await this.refreshPathRegistry();
    const state = this.input.getState();
    if (state.currentSessionId !== null) {
      await this.refreshSessionEvents(state.currentSessionId);
    }
  }

  private async handlePathRegistryMessage(message: BusMessage): Promise<boolean> {
    if (message.type !== NO_LOOSE_STRING_VALUES.pathSwitched && message.type !== NO_LOOSE_STRING_VALUES.pathsUpdated) {
      return false;
    }
    await this.refreshPathRegistry();
    return true;
  }

  private shouldDropForCurrentView(message: BusMessage): boolean {
    const state = this.input.getState();
    return (
      messageTargetsStalePath(message, state) ||
      messageIsStaleRevision(message, state)
    );
  }

  private handleGlobalMessage(message: BusMessage): boolean {
    /* Managed-agent / presence / env-probe messages are session-agnostic
       (they describe global runtime state). */
    if (isManagedAgentMessage(message)) {
      this.input.dispatchManagedAgentWsMessage(message);
      return true;
    }
    if (message.type === "session.forked") {
      this.clearCursorForFork(message);
      return true;
    }
    if (message.type === "session.renamed") {
      this.followRenamedSession(message);
      return true;
    }
    if (message.type !== "files.changed") return false;
    this.refreshChangedFiles(message);
    return true;
  }

  private async handleSessionMessage(message: BusMessage): Promise<void> {
    if (message.type === NO_LOOSE_STRING_VALUES.eventAdded) {
      await this.refreshSessionEvents(message.session_id);
    } else if (message.type === NO_LOOSE_STRING_VALUES.eventSuperseded) {
      this.scheduleSupersededRefresh(message.session_id);
    }
  }

  private scheduleSupersededRefresh(sessionId: string): void {
    const existing = this.supersededRefreshTimers.get(sessionId);
    if (existing !== undefined) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.supersededRefreshTimers.delete(sessionId);
      void this.refreshSessionEvents(sessionId);
    }, EVENT_SUPERSEDED_REFRESH_DELAY_MS);
    this.supersededRefreshTimers.set(sessionId, timer);
  }

  /* The session id is immutable; a rename only changes the display slug.
     Refresh the session list so labels update everywhere — nothing else is
     keyed by the name, so there is no state to remap or follow. */
  private followRenamedSession(
    _message: Extract<BusMessage, { type: "session.renamed" }>,
  ): void {
    void this.client
      .listSessions()
      .then((sessions) => this.input.setSessions(sessions))
      .catch(() => {
        /* list refresh is best-effort; ws consumers also refetch */
      });
  }

  private clearCursorForFork(
    message: Extract<BusMessage, { type: "session.forked" }>,
  ): void {
    const state = this.input.getState();
    const sourcePathId =
      typeof message.pathId === "string" && message.pathId.length > 0
        ? message.pathId
        : (state.selectedPathId ?? state.activePathId);
    if (sourcePathId !== null) {
      clearSessionEventsCursor(sourcePathId, message.source_session_id);
    }
    const forked = forkedSessionIdentity(message.session);
    if (forked === null) return;
    const forkedPathId = forked.pathId ?? sourcePathId;
    if (forkedPathId !== null) {
      clearSessionEventsCursor(forkedPathId, forked.id);
    }
  }

  private async refreshPathState(): Promise<void> {
    try {
      const pathState = await this.client.getPaths();
      this.input.setPathsState(pathState);
    } catch {
      /* legacy kernel; ignore */
    }
  }

  private applySessionSelection(list: SessionMeta[]): void {
    const current = this.input.getState();
    const selected = findSessionForSelection(
      list,
      current.currentSessionId,
      current.selectedPathId,
      current.selectedPath,
    );
    if (selected !== undefined) {
      this.input.setCurrentSession(selected.id, selected);
      return;
    }
    const next = chooseFocusedSessionAcrossPaths(
      list,
      current.currentSessionId,
      current.selectedPathId,
      current.selectedPath,
    );
    this.input.setCurrentSession(next?.id ?? null, next ?? null);
  }

  private async refreshParticipantsForSelection(): Promise<void> {
    const state = this.input.getState();
    const selectedSession = findSessionForSelection(
      state.sessions,
      state.currentSessionId,
      state.selectedPathId,
      state.selectedPath,
    );
    const scope = rootScopeForSession(
      selectedSession,
      state.selectedPathId,
      state.selectedPath,
    );
    if (scope !== null) {
      this.input.setParticipants(await this.client.listParticipants(scope));
    }
  }

  private async refreshPathRegistry(): Promise<void> {
    /* Registry/default metadata changed. New renderer code keeps the
       selected session/root local to this tab, so this refreshes path and
       all-session registries without treating the message as a forced
       selection switch. `path-switched` remains for old clients. */
    await this.refreshPathState();
    try {
      const list = await this.client.listAllSessions();
      this.input.setSessions(list);
      this.applySessionSelection(list);
      await this.refreshParticipantsForSelection();
    } catch {
      /* swallow */
    }
  }

  private refreshChangedFiles(message: FilesChangedBusMessage): void {
    const state = this.input.getState();
    const activeRoot = state.selectedPath ?? state.activePath;
    if (activeRoot === null || message.root !== activeRoot) return;
    const activePathId = state.selectedPathId ?? state.activePathId;
    const scope: RootScope =
      activePathId !== null
        ? { pathId: activePathId }
        : { root: activeRoot };
    void loadFilesTree(this.client, activeRoot, { force: true, scope });
    /* Re-fetch the changed-files badge map (do not patch — §8.3). The
       diff renderers remount on their own per-tab keys; a coarse refresh
       keeps the FileRow badges honest after a tool edit. */
    void loadGitChangedFiles(this.client, scope);
  }

  private eventScopeFor(
    state: AppSocketStoreSnapshot,
    sessionId: string,
  ): { eventPath: string | undefined; scope: RootScope } | null {
    const selected = state.sessions.find(
      (session) =>
        session.id === sessionId &&
        (state.selectedPathId === null ||
          session.path_id === state.selectedPathId),
    );
    const scope = rootScopeForSession(
      selected,
      state.selectedPathId,
      state.selectedPath,
    );
    if (scope === null) return null;
    return {
      eventPath: selected?.path ?? state.selectedPath ?? undefined,
      scope,
    };
  }

  private shouldApplyEventRefresh(input: {
    sessionId: string;
    eventPath: string | undefined;
  }): boolean {
    const nextState = this.input.getState();
    if (nextState.currentSessionId !== input.sessionId) return false;
    return (
      selectedEventPath({
        state: nextState,
        sessionId: input.sessionId,
      }) === input.eventPath
    );
  }

  private canRefreshSessionEvents(
    state: AppSocketStoreSnapshot,
    sessionId: string,
  ): boolean {
    return (
      state.currentSessionId !== null && sessionId === state.currentSessionId
    );
  }

  private async resyncSessionEvents(input: {
    sessionId: string;
    selection: { eventPath: string | undefined; scope: RootScope };
    baseKey: string;
    pathMeta: SessionEventsCursorPathMeta;
    requireMatchingBase?: boolean;
  }): Promise<void> {
    const scanStartedAt = scanTimestamp();
    const fresh = await this.client.listEvents(
      input.sessionId,
      input.selection.scope,
    );
    if (
      !this.shouldApplyEventRefresh({
        sessionId: input.sessionId,
        eventPath: input.selection.eventPath,
      })
    ) {
      return;
    }
    const state = this.input.getState();
    if (input.requireMatchingBase !== false && state.eventsBaseKey !== input.baseKey) {
      return;
    }
    this.input.setEvents(fresh, input.baseKey);
    saveSessionEventsCursor(
      advanceCursor(undefined, fresh, scanStartedAt, input.pathMeta),
    );
  }

  private async fetchIncrementalEvents(input: {
    sessionId: string;
    selection: { eventPath: string | undefined; scope: RootScope };
    baseKey: string;
    pathMeta: SessionEventsCursorPathMeta;
  }): Promise<void> {
    const cursor = loadSessionEventsCursor(
      input.pathMeta.path_id,
      input.sessionId,
    );
    if (cursor === undefined) return;
    const scanStartedAt = scanTimestamp();
    const delta = await this.client.listEvents(
      input.sessionId,
      input.selection.scope,
      { since: readSince(cursor) },
    );
    if (
      !this.shouldApplyEventRefresh({
        sessionId: input.sessionId,
        eventPath: input.selection.eventPath,
      })
    ) {
      return;
    }
    const state = this.input.getState();
    if (state.eventsBaseKey !== input.baseKey || state.events.length === 0) {
      return;
    }
    const merged = mergeEventRecords(state.events, delta);
    if (!eventsMergeIntegrityOk(merged, delta)) {
      clearSessionEventsCursor(input.pathMeta.path_id, input.sessionId);
      await this.resyncSessionEvents(input);
      return;
    }
    this.input.mergeEvents(delta, input.baseKey);
    saveSessionEventsCursor(
      advanceCursor(cursor, delta, scanStartedAt, input.pathMeta),
    );
  }

  private async refreshSessionEvents(sessionId: string): Promise<void> {
    const state = this.input.getState();
    if (!this.canRefreshSessionEvents(state, sessionId)) return;

    try {
      const selection = this.eventScopeFor(state, sessionId);
      if (selection === null) return;
      const baseKey = eventsBaseKeyFor(selection.scope, sessionId);
      if (state.eventsBaseKey !== baseKey || state.events.length === 0) {
        await this.resyncSessionEvents({
          sessionId,
          selection,
          baseKey,
          pathMeta: cursorPathMetaFor({
            scope: selection.scope,
            sessionId,
            selectedPathId: state.selectedPathId,
            selectedPath: state.selectedPath,
            eventPath: selection.eventPath,
          }),
          requireMatchingBase: false,
        });
        return;
      }
      await this.fetchIncrementalEvents({
        sessionId,
        selection,
        baseKey,
        pathMeta: cursorPathMetaFor({
          scope: selection.scope,
          sessionId,
          selectedPathId: state.selectedPathId,
          selectedPath: state.selectedPath,
          eventPath: selection.eventPath,
        }),
      });
    } catch {
      /* stale path/session fetch; a later path/session refresh will catch up */
    }
  }
}
