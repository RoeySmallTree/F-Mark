import type {
  AnyEventRecord,
  EventKind,
  ListSessionEventsResponse,
  SessionEventGroup,
  SessionWithPath,
} from "@f-mark/shared";
import {
  isoTimestamp,
  normalizeTimestampForSort,
  toIsoTimestamp,
} from "@f-mark/shared";
import { paths as makePaths } from "../../paths.js";
import { globalPaths, type GlobalPaths } from "../../paths/global.js";
import { listSessions } from "../../sessions.js";
import { listParticipants, type ParticipantWithSession } from "../../participants.js";
import { readEvents } from "../../events/reader.js";
import {
  ensureAllSessionEventsConfig,
  readGlobalConfig,
  updateGlobalConfig,
  type AllSessionEventsCursorEntry,
  type AllSessionEventsFilterCursor,
} from "../../state/globalConfig.js";
import { SessionPathResolver } from "./pathResolver.js";
import type { RouteResult, SessionRouteDeps } from "./types.js";

export interface SessionEventsQuery {
  scope?: string;
  kinds?: string;
  since?: string;
  incremental?: string;
}

type ErrorBody = { error: string; detail?: string };
type ErrorResult = RouteResult<ErrorBody> & { status: number };
type SessionEventsResult = RouteResult<ListSessionEventsResponse | ErrorBody>;
type SessionEventsCursor = NonNullable<ListSessionEventsResponse["cursor"]>;

interface SessionEventRequest {
  scope?: string;
  kinds?: EventKind[];
  since?: string;
  incremental: boolean;
  cursorKey: string;
  scanStartedAt?: string;
}

interface SessionEventReadResult {
  groups: SessionEventGroup[];
  presentSessionKeys: Set<string>;
  cursorUpdates: Map<string, AllSessionEventsCursorEntry>;
}

export class SessionEventsService {
  constructor(
    private readonly deps: SessionRouteDeps,
    private readonly pathResolver = new SessionPathResolver(deps),
  ) {}

  async list(query: SessionEventsQuery): Promise<SessionEventsResult> {
    const parsed = SessionEventRequestParser.parse(query);
    if (isErrorResult(parsed)) return parsed;
    const request = withScanStartedAt(parsed);

    const cursorStore = this.openCursorStore(request);
    let cursorSnapshot: AllSessionEventsFilterCursor | undefined;
    if (cursorStore !== null) {
      const snapshot = await cursorStore.snapshot();
      if (isErrorResult(snapshot)) return snapshot;
      cursorSnapshot = snapshot;
    }

    const sessions = await this.resolveSessions(request.scope);
    const read = await new SessionEventGroupReader(request, cursorSnapshot).read(
      sessions,
    );

    if (cursorStore === null) {
      return {
        body: {
          groups: read.groups,
          ...(request.since !== undefined ? { mode: "full" as const } : {}),
        },
      };
    }

    const cursorResult = await cursorStore.persist(read);
    if (isErrorResult(cursorResult)) return cursorResult;
    return {
      body: {
        groups: read.groups,
        mode: "incremental",
        cursor: cursorResult,
      },
    };
  }

  private openCursorStore(
    request: SessionEventRequest,
  ): AllSessionEventCursorStore | null {
    if (!request.incremental) return null;
    return new AllSessionEventCursorStore(
      this.resolveGlobalPaths(),
      request.cursorKey,
      request.scanStartedAt ?? isoTimestamp(),
    );
  }

  private resolveGlobalPaths(): GlobalPaths {
    return this.deps.ref?.global() ?? globalPaths();
  }

  private async resolveSessions(scope: string | undefined): Promise<SessionWithPath[]> {
    if (scope === "all") {
      return this.pathResolver.listSessionsAcrossPaths();
    }
    const p = this.pathResolver.resolveListPaths();
    return (await listSessions(p)).map((session) =>
      this.pathResolver.withPathMetadata(session, p),
    );
  }
}

class SessionEventRequestParser {
  static parse(
    query: SessionEventsQuery,
  ): SessionEventRequest | ErrorResult {
    const kinds = parseKinds(query.kinds);
    const since = parseSince(query.since);
    const incremental = query.incremental === "1";

    if (query.incremental !== undefined && !incremental) {
      return {
        status: 400,
        body: { error: "incremental must be 1 when supplied" },
      };
    }
    if (incremental && since !== undefined) {
      return {
        status: 400,
        body: { error: "incremental and since are mutually exclusive" },
      };
    }
    if (incremental && query.scope !== "all") {
      return {
        status: 400,
        body: { error: "incremental is only supported with scope=all" },
      };
    }
    return {
      scope: query.scope,
      kinds,
      since,
      incremental,
      cursorKey: allSessionEventsCursorKey(kinds),
    };
  }
}

class SessionEventGroupReader {
  private readonly participantsByPath = new Map<
    string,
    Record<string, ParticipantWithSession>
  >();

  constructor(
    private readonly request: SessionEventRequest,
    private readonly cursorSnapshot: AllSessionEventsFilterCursor | undefined,
  ) {}

  async read(sessions: SessionWithPath[]): Promise<SessionEventReadResult> {
    const groups: SessionEventGroup[] = [];
    const cursorUpdates = new Map<string, AllSessionEventsCursorEntry>();
    const presentSessionKeys = new Set(sessions.map(sessionCursorKey));

    for (const session of sessions) {
      const entry = await this.readSession(session);
      if (entry.cursorUpdate !== undefined) {
        cursorUpdates.set(sessionCursorKey(session), entry.cursorUpdate);
      }
      if (entry.include) groups.push(entry.group);
    }

    return { groups, presentSessionKeys, cursorUpdates };
  }

  private async readSession(session: SessionWithPath): Promise<{
    group: SessionEventGroup;
    include: boolean;
    cursorUpdate?: AllSessionEventsCursorEntry;
  }> {
    const p = makePaths(session.path);
    const participants = await this.participantsFor(session.path);
    const existingCursor = this.cursorSnapshot?.sessions[sessionCursorKey(session)];
    const readSince = this.request.since ?? cursorReadSince(existingCursor);
    const { events, succeeded } = await readSessionEvents(
      p,
      session.id,
      this.request.kinds,
      readSince,
    );
    const group = {
      path: session.path,
      path_id: session.path_id,
      session,
      events,
      participants,
    };
    return {
      group,
      include: shouldIncludeGroup(this.request, events, existingCursor, succeeded),
      cursorUpdate: this.cursorUpdate(session, events, existingCursor, succeeded),
    };
  }

  private async participantsFor(
    path: string,
  ): Promise<Record<string, ParticipantWithSession>> {
    const cached = this.participantsByPath.get(path);
    if (cached !== undefined) return cached;
    let participants: Record<string, ParticipantWithSession>;
    try {
      participants = await listParticipants(makePaths(path));
    } catch {
      participants = {};
    }
    this.participantsByPath.set(path, participants);
    return participants;
  }

  private cursorUpdate(
    session: SessionWithPath,
    events: AnyEventRecord[],
    existingCursor: AllSessionEventsCursorEntry | undefined,
    succeeded: boolean,
  ): AllSessionEventsCursorEntry | undefined {
    if (!this.request.incremental || !succeeded) return undefined;
    const update: AllSessionEventsCursorEntry = {
      path: session.path,
      path_id: session.path_id,
      session_id: session.id,
      last_checked_at: this.request.scanStartedAt ?? isoTimestamp(),
    };
    const latestSeen = maxTimestamp(
      existingCursor?.last_seen_event_at,
      latestEventTimestamp(events),
    );
    if (latestSeen !== undefined) update.last_seen_event_at = latestSeen;
    return update;
  }
}

function isErrorResult<T>(
  value: T | ErrorResult,
): value is ErrorResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    "body" in value
  );
}

function withScanStartedAt(request: SessionEventRequest): SessionEventRequest {
  if (!request.incremental) return request;
  return { ...request, scanStartedAt: isoTimestamp() };
}

class AllSessionEventCursorStore {
  constructor(
    private readonly g: GlobalPaths,
    private readonly key: string,
    private readonly scanStartedAt: string,
  ) {}

  async snapshot(): Promise<
    AllSessionEventsFilterCursor | undefined | ErrorResult
  > {
    try {
      const config = await readGlobalConfig(this.g);
      return snapshotFilterCursor(config.allSessionEvents?.cursors?.[this.key]);
    } catch (err) {
      return {
        status: 500,
        body: {
          error: "failed to read all-session event cursor",
          detail: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  async persist(
    read: SessionEventReadResult,
  ): Promise<SessionEventsCursor | ErrorResult> {
    try {
      await updateGlobalConfig(this.g, (config) => {
        const allSessionEvents = ensureAllSessionEventsConfig(config);
        const existing = allSessionEvents.cursors[this.key];
        allSessionEvents.cursors[this.key] = {
          updated_at: maxTimestamp(existing?.updated_at, this.scanStartedAt)!,
          sessions: this.mergeSessions(existing, read),
        };
        return config;
      });
    } catch (err) {
      return {
        status: 500,
        body: {
          error: "failed to persist all-session event cursor",
          detail: err instanceof Error ? err.message : String(err),
        },
      };
    }
    return {
      key: this.key,
      checked_at: this.scanStartedAt,
      sessions_updated: read.cursorUpdates.size,
    };
  }

  private mergeSessions(
    existing: AllSessionEventsFilterCursor | undefined,
    read: SessionEventReadResult,
  ): Record<string, AllSessionEventsCursorEntry> {
    const next: Record<string, AllSessionEventsCursorEntry> = {};
    for (const [key, cursor] of Object.entries(existing?.sessions ?? {})) {
      if (this.shouldKeepExisting(key, cursor, read.presentSessionKeys)) {
        next[key] = cursor;
      }
    }
    for (const [key, update] of read.cursorUpdates) {
      next[key] = mergeCursorEntry(next[key], update);
    }
    return next;
  }

  private shouldKeepExisting(
    key: string,
    cursor: AllSessionEventsCursorEntry,
    presentSessionKeys: Set<string>,
  ): boolean {
    return (
      presentSessionKeys.has(key) ||
      normalizeTimestampForSort(cursor.last_checked_at) >
        normalizeTimestampForSort(this.scanStartedAt)
    );
  }
}

async function readSessionEvents(
  p: ReturnType<typeof makePaths>,
  sessionId: string,
  kinds: EventKind[] | undefined,
  since: string | undefined,
): Promise<{ events: AnyEventRecord[]; succeeded: boolean }> {
  try {
    return {
      events: await readEvents(p, sessionId, { kinds, since }),
      succeeded: true,
    };
  } catch {
    return { events: [], succeeded: false };
  }
}

function shouldIncludeGroup(
  request: SessionEventRequest,
  events: AnyEventRecord[],
  existingCursor: AllSessionEventsCursorEntry | undefined,
  readSucceeded: boolean,
): boolean {
  return (
    !request.incremental ||
    events.length > 0 ||
    existingCursor === undefined ||
    !readSucceeded
  );
}

function parseKinds(raw: string | undefined): EventKind[] | undefined {
  const kinds = raw
    ?.split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0) as EventKind[] | undefined;
  return kinds === undefined || kinds.length === 0 ? undefined : kinds;
}

function parseSince(raw: string | undefined): string | undefined {
  return raw !== undefined && raw.trim().length > 0 ? raw.trim() : undefined;
}

function allSessionEventsCursorKey(kinds: EventKind[] | undefined): string {
  if (kinds === undefined || kinds.length === 0) return "scope=all;kinds=*";
  return `scope=all;kinds=${[...new Set(kinds)].sort().join(",")}`;
}

function sessionCursorKey(session: SessionWithPath): string {
  return `${session.path_id}/${session.id}`;
}

function cursorReadSince(
  cursor: AllSessionEventsCursorEntry | undefined,
): string | undefined {
  if (cursor?.last_checked_at === undefined) return undefined;
  return subtractOneMillisecond(cursor.last_checked_at);
}

function compactTimestampToDate(ts: string): Date {
  const normalized = normalizeTimestampForSort(ts);
  return new Date(
    `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}T${normalized.slice(9, 11)}:${normalized.slice(11, 13)}:${normalized.slice(13, 15)}.${normalized.slice(16, 19)}Z`,
  );
}

function subtractOneMillisecond(ts: string): string {
  const date = compactTimestampToDate(ts);
  date.setUTCMilliseconds(date.getUTCMilliseconds() - 1);
  return toIsoTimestamp(date);
}

function maxTimestamp(
  a: string | undefined,
  b: string | undefined,
): string | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return normalizeTimestampForSort(a) >= normalizeTimestampForSort(b) ? a : b;
}

function latestEventTimestamp(events: AnyEventRecord[]): string | undefined {
  let latest: string | undefined;
  for (const event of events) latest = maxTimestamp(latest, event.timestamp);
  return latest;
}

function snapshotFilterCursor(
  cursor: AllSessionEventsFilterCursor | undefined,
): AllSessionEventsFilterCursor | undefined {
  if (cursor === undefined) return undefined;
  return {
    updated_at: cursor.updated_at,
    sessions: Object.fromEntries(
      Object.entries(cursor.sessions ?? {}).map(([key, value]) => [
        key,
        { ...value },
      ]),
    ),
  };
}

function mergeCursorEntry(
  current: AllSessionEventsCursorEntry | undefined,
  update: AllSessionEventsCursorEntry,
): AllSessionEventsCursorEntry {
  if (current === undefined) return update;
  const lastSeenEventAt = maxTimestamp(
    current.last_seen_event_at,
    update.last_seen_event_at,
  );
  return {
    ...current,
    path: update.path,
    path_id: update.path_id,
    session_id: update.session_id,
    last_checked_at:
      maxTimestamp(current.last_checked_at, update.last_checked_at) ??
      update.last_checked_at,
    ...(lastSeenEventAt !== undefined ? { last_seen_event_at: lastSeenEventAt } : {}),
  };
}
