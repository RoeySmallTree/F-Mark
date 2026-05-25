import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Plus, Search } from "lucide-react";
import { createClient } from "../api/client.js";
import type { SessionMeta } from "../api/client.js";
import { connectWs } from "../api/ws.js";
import { useStore } from "../state/store.js";

type GroupKey =
  | "Today"
  | "Yesterday"
  | "Earlier this week"
  | "This month"
  | "Older";

const GROUP_ORDER: GroupKey[] = [
  "Today",
  "Yesterday",
  "Earlier this week",
  "This month",
  "Older",
];

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function groupFor(createdIso: string, now: Date): GroupKey {
  const created = new Date(createdIso);
  if (Number.isNaN(created.getTime())) return "Older";
  const today = startOfDay(now);
  const created0 = startOfDay(created);
  const dayDiffMs = today.getTime() - created0.getTime();
  const dayDiff = Math.round(dayDiffMs / (24 * 60 * 60 * 1000));
  if (dayDiff <= 0) return "Today";
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff <= 6) return "Earlier this week";
  if (
    created.getFullYear() === now.getFullYear() &&
    created.getMonth() === now.getMonth()
  ) {
    return "This month";
  }
  if (dayDiff <= 31) return "This month";
  return "Older";
}

function formatRelative(createdIso: string, now: Date): string {
  const created = new Date(createdIso);
  if (Number.isNaN(created.getTime())) return "";
  const diffMs = now.getTime() - created.getTime();
  const minutes = Math.round(diffMs / (60 * 1000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return created.toLocaleDateString();
}

function basename(absPath: string | null | undefined): string {
  if (absPath === null || absPath === undefined || absPath.length === 0) {
    return "Current repo";
  }
  const trimmed = absPath.replace(/\/+$/, "");
  const slash = trimmed.lastIndexOf("/");
  if (slash < 0) return trimmed;
  return trimmed.slice(slash + 1) || trimmed;
}

function sessionKey(s: SessionMeta, fallbackPath: string | null): string {
  return `${s.path ?? fallbackPath ?? "__current__"}::${s.id}`;
}

function withFallbackPath(
  session: SessionMeta,
  fallbackPath: string | null,
): SessionMeta {
  if (session.path !== undefined || fallbackPath === null) return session;
  return { ...session, path: fallbackPath };
}

function sortSessions(sessions: SessionMeta[]): SessionMeta[] {
  return [...sessions].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
}

interface RepoGroup {
  key: string;
  path: string | null;
  label: string;
  sessions: SessionMeta[];
  latest: string;
}

export function Sessions(): JSX.Element {
  const sessions = useStore((s) => s.sessions);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const activePath = useStore((s) => s.activePath);
  const setCurrentSession = useStore((s) => s.setCurrentSession);
  const setSessions = useStore((s) => s.setSessions);
  const setParticipants = useStore((s) => s.setParticipants);
  const setPathsState = useStore((s) => s.setPathsState);
  const openModal = useStore((s) => s.openModal);
  const token = useStore((s) => s.token);
  const [allSessions, setAllSessions] = useState<SessionMeta[]>(() =>
    sessions.map((s) => withFallbackPath(s, activePath)),
  );
  const [query, setQuery] = useState("");
  const [switchingSessionKey, setSwitchingSessionKey] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessions.length === 0) return;
    setAllSessions((prev) => {
      const byKey = new Map<string, SessionMeta>();
      for (const session of prev) {
        byKey.set(sessionKey(session, null), session);
      }
      for (const session of sessions) {
        const next = withFallbackPath(session, activePath);
        if (next.path !== undefined) {
          byKey.delete(`__current__::${next.id}`);
        }
        byKey.set(sessionKey(next, activePath), next);
      }
      return sortSessions([...byKey.values()]);
    });
  }, [sessions, activePath]);

  // Re-fetch all repo sessions on WS event (new session/event/path switch).
  useEffect(() => {
    const client = createClient({ baseUrl: "", token });
    let cancelled = false;
    const refresh = (): void => {
      void client
        .listAllSessions()
        .then((list) => {
          if (!cancelled && Array.isArray(list)) {
            setAllSessions(sortSessions(list));
          }
        })
        .catch(() => {
          void client.listSessions().then((list) => {
            if (!cancelled && Array.isArray(list)) {
              setAllSessions(
                sortSessions(list.map((s) => withFallbackPath(s, activePath))),
              );
            }
          });
        });
    };
    refresh();
    const ws = connectWs({ baseUrl: "", token }, (msg) => {
      // Any event_added or new session may change ordering — re-fetch.
      if (msg.type === "event_added" || msg.type === "path-switched") {
        refresh();
      }
    });
    return () => {
      cancelled = true;
      ws.close();
    };
  }, [token, activePath]);

  const selectSession = useCallback(
    async (session: SessionMeta): Promise<void> => {
      const targetPath = session.path ?? null;
      if (targetPath === null || targetPath === activePath) {
        setCurrentSession(session.id);
        return;
      }

      const client = createClient({ baseUrl: "", token });
      setSwitchingSessionKey(sessionKey(session, activePath));
      setError(null);
      try {
        const nextPaths = await client.setActivePath(targetPath);
        setPathsState(nextPaths);
        const [list, participants] = await Promise.all([
          client.listSessions(),
          client.listParticipants(),
        ]);
        setSessions(list);
        setParticipants(participants);
        setCurrentSession(session.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setSwitchingSessionKey(null);
      }
    },
    [
      activePath,
      setCurrentSession,
      setParticipants,
      setPathsState,
      setSessions,
      token,
    ],
  );

  const now = useMemo(() => new Date(), [allSessions.length]);
  const repoGroups = useMemo(() => {
    const q = query.toLowerCase().trim();
    const filtered = allSessions
      .map((s) => withFallbackPath(s, activePath))
      .filter((s) => {
        if (q.length === 0) return true;
        const path = s.path ?? "";
        return (
          s.slug.toLowerCase().includes(q) ||
          basename(path).toLowerCase().includes(q) ||
          path.toLowerCase().includes(q)
        );
      });

    const byRepo = new Map<string, RepoGroup>();
    for (const s of filtered) {
      const path = s.path ?? null;
      const key = path ?? "__current__";
      const existing = byRepo.get(key);
      if (existing) {
        existing.sessions.push(s);
        if (s.created_at > existing.latest) existing.latest = s.created_at;
      } else {
        byRepo.set(key, {
          key,
          path,
          label: basename(path),
          sessions: [s],
          latest: s.created_at,
        });
      }
    }

    return [...byRepo.values()].sort((a, b) => {
      if (a.path === activePath && b.path !== activePath) return -1;
      if (b.path === activePath && a.path !== activePath) return 1;
      return b.latest.localeCompare(a.latest);
    });
  }, [allSessions, activePath, query]);

  return (
    <aside
      className="left-panel"
      role="tabpanel"
      aria-label="Sessions panel"
    >
      <div className="panel-head">
        <h3>SESSIONS</h3>
        <button
          type="button"
          className="new-btn"
          onClick={() => openModal("new-session")}
          aria-label="Start a new session"
        >
          <Plus size={10} style={{ marginRight: 3, verticalAlign: -1 }} />
          NEW
        </button>
      </div>
      <div className="panel-search">
        <Search size={12} aria-hidden="true" style={{ color: "var(--ink-4)" }} />
        <input
          placeholder="Search sessions…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search sessions"
        />
      </div>
      <div className="panel-list">
        {allSessions.length === 0 ? (
          <p
            style={{
              fontFamily: "var(--serif)",
              fontStyle: "italic",
              color: "var(--ink-3)",
              fontSize: 13,
              margin: "10px 14px",
            }}
          >
            No sessions yet. Press + New.
          </p>
        ) : repoGroups.length === 0 ? (
          <p className="panel-empty">No matching sessions.</p>
        ) : (
          (() => {
            let staggerIdx = -1;
            return repoGroups.map((repo) => {
              const dateGroups = new Map<GroupKey, SessionMeta[]>();
              for (const key of GROUP_ORDER) dateGroups.set(key, []);
              for (const s of repo.sessions) {
                const g = groupFor(s.created_at, now);
                dateGroups.get(g)!.push(s);
              }
              return (
                <details
                  key={repo.key}
                  className={[
                    "repo-session-group",
                    repo.path === activePath ? "active-repo" : "",
                  ]
                    .join(" ")
                    .trim()}
                  open
                >
                  <summary className="repo-session-summary">
                    <ChevronDown
                      size={13}
                      aria-hidden="true"
                      className="repo-session-chevron"
                    />
                    <span className="repo-session-title">{repo.label}</span>
                    <span className="repo-session-count">
                      {repo.sessions.length}
                    </span>
                    {repo.path !== null ? (
                      <span className="repo-session-path" title={repo.path}>
                        {repo.path}
                      </span>
                    ) : null}
                  </summary>
                  <div className="repo-session-body">
                    {GROUP_ORDER.map((key) => {
                      const items = dateGroups.get(key) ?? [];
                      if (items.length === 0) return null;
                      return (
                        <div key={`${repo.key}:${key}`}>
                          <div className="group-label">{key.toUpperCase()}</div>
                          {items.map((s) => {
                            const active =
                              s.id === currentSessionId &&
                              (s.path === undefined ||
                                activePath === null ||
                                s.path === activePath);
                            const itemKey = `${s.path ?? "__current__"}:${s.id}`;
                            const switching =
                              switchingSessionKey === sessionKey(s, activePath);
                            staggerIdx += 1;
                            const i = Math.min(staggerIdx, 5);
                            return (
                              <div
                                key={itemKey}
                                role="button"
                                tabIndex={0}
                                className={[
                                  "session-item",
                                  "staggered-row",
                                  active ? "active" : "",
                                  switching ? "switching" : "",
                                ]
                                  .join(" ")
                                  .trim()}
                                style={{ ["--i" as string]: i }}
                                onClick={() => void selectSession(s)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    void selectSession(s);
                                  }
                                }}
                                aria-pressed={active}
                                aria-busy={switching}
                              >
                                <div className="row1">
                                  <span
                                    className={[
                                      "status-dot",
                                      active ? "active" : "idle",
                                    ].join(" ")}
                                    aria-hidden="true"
                                  />
                                  <span className="slug">{s.slug}</span>
                                </div>
                                <div className="meta">
                                  <span>{formatRelative(s.created_at, now)}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </details>
              );
            });
          })()
        )}
        {error !== null ? (
          <p className="panel-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </aside>
  );
}
