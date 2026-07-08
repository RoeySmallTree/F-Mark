import type { AgentStatusRow, SessionMeta } from "@f-mark/shared";
import type { RootScope } from "../../../api/rootScope.js";
import { basename } from "../../../panels/sessions/model.js";

const NO_LOOSE_STRING_VALUES = {
  connected: "connected",
  unknown: "unknown",
  unknownSession: "Unknown session",
} as const;

export interface ConnectedAgentEntry {
  agent: AgentStatusRow;
  scope: RootScope;
  path: string | null;
  pathId: string | null;
}

export interface SessionAgentGroup {
  sessionId: string | null;
  sessionSlug: string;
  session: SessionMeta | null;
  agents: ConnectedAgentEntry[];
}

export interface PathAgentGroup {
  path: string | null;
  pathId: string | null;
  label: string;
  sessions: SessionAgentGroup[];
}

export interface PathScopeMeta {
  scope: RootScope;
  path: string | null;
  pathId: string | null;
  pathKey: string;
}

export function isConnectedAgent(agent: AgentStatusRow): boolean {
  return agent.connection_state === NO_LOOSE_STRING_VALUES.connected;
}

export function pathKey(path: string | null, pathId: string | null): string {
  if (pathId !== null && pathId.length > 0) return `path_id:${pathId}`;
  if (path !== null && path.length > 0) return `root:${path}`;
  return NO_LOOSE_STRING_VALUES.unknown;
}

export function scopeFromPathMeta(
  path: string | null,
  pathId: string | null,
): RootScope | null {
  if (pathId !== null && pathId.length > 0) return { pathId };
  if (path !== null && path.length > 0) return { root: path };
  return null;
}

export function collectPathScopes(sessions: SessionMeta[]): PathScopeMeta[] {
  const seen = new Set<string>();
  const out: PathScopeMeta[] = [];

  for (const session of sessions) {
    const path = session.path ?? null;
    const pathId = session.path_id ?? null;
    const scope = scopeFromPathMeta(path, pathId);
    if (scope === null) continue;
    const key = pathKey(path, pathId);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ scope, path, pathId, pathKey: key });
  }
  return out;
}

function sessionLookupKey(
  path: string | null,
  pathId: string | null,
  sessionId: string,
): string {
  return `${pathKey(path, pathId)}::${sessionId}`;
}

export function buildPathAgentGroups(
  entries: ConnectedAgentEntry[],
  sessions: SessionMeta[],
): PathAgentGroup[] {
  const sessionByKey = new Map<string, SessionMeta>();
  for (const session of sessions) {
    sessionByKey.set(
      sessionLookupKey(session.path ?? null, session.path_id ?? null, session.id),
      session,
    );
  }

  const byPath = new Map<
    string,
    {
      path: string | null;
      pathId: string | null;
      label: string;
      bySession: Map<string | null, ConnectedAgentEntry[]>;
    }
  >();

  for (const entry of entries) {
    const pk = pathKey(entry.path, entry.pathId);
    let pathGroup = byPath.get(pk);
    if (pathGroup === undefined) {
      pathGroup = {
        path: entry.path,
        pathId: entry.pathId,
        label: basename(entry.path),
        bySession: new Map(),
      };
      byPath.set(pk, pathGroup);
    }
    const sessionId =
      entry.agent.active_session ?? entry.agent.membership_session_id;
    const list = pathGroup.bySession.get(sessionId) ?? [];
    list.push(entry);
    pathGroup.bySession.set(sessionId, list);
  }

  return [...byPath.values()]
    .map((pathGroup) => ({
      path: pathGroup.path,
      pathId: pathGroup.pathId,
      label: pathGroup.label,
      sessions: [...pathGroup.bySession.entries()]
        .map(([sessionId, agents]) => {
          const session =
            sessionId === null
              ? null
              : sessionByKey.get(
                  sessionLookupKey(pathGroup.path, pathGroup.pathId, sessionId),
                ) ?? null;
          const sessionSlug =
            session?.slug ??
            (sessionId === null
              ? NO_LOOSE_STRING_VALUES.unknownSession
              : sessionId);
          agents.sort((a, b) =>
            a.agent.display_name.localeCompare(b.agent.display_name),
          );
          return {
            sessionId,
            sessionSlug,
            session,
            agents,
          };
        })
        .sort((a, b) => a.sessionSlug.localeCompare(b.sessionSlug)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function activityLabel(agent: AgentStatusRow): string {
  return agent.activity_state.replace(/-/g, " ");
}
