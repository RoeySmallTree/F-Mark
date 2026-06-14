import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type MouseEvent,
} from "react";
import {
  Check,
  ChevronDown,
  GitFork,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { createClient } from "../api/client.js";
import type { ForkSessionResponse, SessionMeta } from "../api/client.js";
import { connectWs } from "../api/ws.js";
import { ForkSessionPopover } from "../components/ForkSessionPopover.js";
import { useStore } from "../state/store.js";

const SLUG_RE = /^[a-z0-9-]+$/;

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

const SESSION_ORDER_STORAGE_KEY = "fmark.sessionOrderByRepo";

function loadSessionOrderByRepo(): Record<string, string[]> {
  try {
    const raw = globalThis.localStorage?.getItem(SESSION_ORDER_STORAGE_KEY);
    if (raw === null || raw === undefined) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object") return {};
    const out: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(value)) continue;
      out[key] = value.filter((item): item is string => typeof item === "string");
    }
    return out;
  } catch {
    return {};
  }
}

function saveSessionOrderByRepo(map: Record<string, string[]>): void {
  try {
    globalThis.localStorage?.setItem(
      SESSION_ORDER_STORAGE_KEY,
      JSON.stringify(map),
    );
  } catch {
    /* swallow */
  }
}

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

function orderedSessions(
  sessions: SessionMeta[],
  order: string[] | undefined,
): SessionMeta[] {
  if (order === undefined || order.length === 0) return sortSessions(sessions);
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...sessions].sort((a, b) => {
    const ar = rank.get(a.id);
    const br = rank.get(b.id);
    if (ar !== undefined && br !== undefined) return ar - br;
    if (ar !== undefined) return -1;
    if (br !== undefined) return 1;
    return b.created_at.localeCompare(a.created_at);
  });
}

type SessionBadge = "working" | "awaiting input" | "done unread" | "done read";

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
  const participants = useStore((s) => s.participants);
  const managedAgents = useStore((s) => s.managedAgents);
  const events = useStore((s) => s.events);
  const lastSeenBySession = useStore((s) => s.lastSeenBySession);
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
  const [forkTarget, setForkTarget] = useState<SessionMeta | null>(null);
  const [forkAnchorRect, setForkAnchorRect] = useState<DOMRect | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedNewPath, setExpandedNewPath] = useState<string | null>(null);
  const [sessionOrderByRepo, setSessionOrderByRepo] = useState(() =>
    loadSessionOrderByRepo(),
  );
  const [draggingSessionId, setDraggingSessionId] = useState<string | null>(null);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    session: SessionMeta;
  } | null>(null);

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

  const refreshAllSessions = useCallback((): void => {
    const client = createClient({ baseUrl: "", token });
    void (async () => {
      try {
        const list = await client.listAllSessions();
        if (Array.isArray(list)) {
          setAllSessions(sortSessions(list));
        }
      } catch {
        try {
          const list = await client.listSessions();
          if (Array.isArray(list)) {
            setAllSessions(
              sortSessions(list.map((s) => withFallbackPath(s, activePath))),
            );
          }
        } catch {
          /* Leave the current list in place on refresh failure. */
        }
      }
    })();
  }, [token, activePath]);

  const refreshActivePathSessions = useCallback(async (): Promise<void> => {
    const client = createClient({ baseUrl: "", token });
    const [list, nextParticipants] = await Promise.all([
      client.listSessions(),
      client.listParticipants(),
    ]);
    setSessions(list);
    setParticipants(nextParticipants);
  }, [setParticipants, setSessions, token]);

  // Re-fetch all repo sessions on WS event (new session/event/path switch).
  useEffect(() => {
    refreshAllSessions();
    const ws = connectWs({ baseUrl: "", token }, (msg) => {
      // Any event_added or new session may change ordering — re-fetch.
      if (
        msg.type === "event_added" ||
        msg.type === "path-switched" ||
        msg.type === "session.forked"
      ) {
        refreshAllSessions();
      }
    });
    return () => {
      ws.close();
    };
  }, [token, refreshAllSessions]);

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

  const beginRename = useCallback((session: SessionMeta): void => {
    setContextMenu(null);
    setRenamingSessionId(session.id);
    setRenameValue(session.slug);
  }, []);

  const cancelRename = useCallback((): void => {
    setRenamingSessionId(null);
    setRenameValue("");
  }, []);

  const saveRename = useCallback(
    async (session: SessionMeta): Promise<void> => {
      const nextSlug = renameValue.trim();
      if (!SLUG_RE.test(nextSlug)) {
        setError("Session name must use lowercase letters, numbers, and hyphens.");
        return;
      }
      const client = createClient({ baseUrl: "", token });
      try {
        const updated = await client.updateSession(session.id, {
          slug: nextSlug,
          ...(session.path !== undefined ? { path: session.path } : {}),
        });
        const withPath = withFallbackPath(updated, session.path ?? activePath);
        setAllSessions((prev) =>
          sortSessions(
            prev.map((item) =>
              item.id === session.id &&
              (item.path ?? activePath) === (session.path ?? activePath)
                ? withPath
                : item,
            ),
          ),
        );
        if (session.id === currentSessionId) setCurrentSession(updated.id);
        if (session.path === undefined || session.path === activePath) {
          await refreshActivePathSessions();
        }
        cancelRename();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [
      activePath,
      cancelRename,
      currentSessionId,
      refreshActivePathSessions,
      renameValue,
      setCurrentSession,
      token,
    ],
  );

  const deleteSession = useCallback(
    async (session: SessionMeta): Promise<void> => {
      setContextMenu(null);
      const confirmed = window.confirm(
        `Delete session "${session.slug}" from F-Mark? Project files are not deleted.`,
      );
      if (!confirmed) return;
      const client = createClient({ baseUrl: "", token });
      try {
        await client.deleteSession(session.id, session.path);
        const remaining = allSessions.filter(
          (item) =>
            !(
              item.id === session.id &&
              (item.path ?? activePath) === (session.path ?? activePath)
            ),
        );
        setAllSessions(remaining);
        if (session.id === currentSessionId) {
          const next =
            remaining.find(
              (item) => (item.path ?? activePath) === (session.path ?? activePath),
            ) ?? null;
          setCurrentSession(next?.id ?? null);
        }
        if (session.path === undefined || session.path === activePath) {
          await refreshActivePathSessions();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [
      activePath,
      allSessions,
      currentSessionId,
      refreshActivePathSessions,
      setCurrentSession,
      token,
    ],
  );

  const openFork = useCallback(
    (event: MouseEvent<HTMLButtonElement>, session: SessionMeta): void => {
      event.preventDefault();
      event.stopPropagation();
      setForkTarget(withFallbackPath(session, activePath));
      setForkAnchorRect(event.currentTarget.getBoundingClientRect());
    },
    [activePath],
  );

  const closeFork = useCallback((): void => {
    setForkTarget(null);
    setForkAnchorRect(null);
  }, []);

  const handleForked = useCallback((response: ForkSessionResponse): void => {
    setAllSessions((prev) => {
      const next = withFallbackPath(response.session, response.session.path ?? null);
      const key = sessionKey(next, null);
      const rest = prev.filter((session) => sessionKey(session, null) !== key);
      return sortSessions([next, ...rest]);
    });
  }, []);

  const sessionBadge = useCallback(
    (session: SessionMeta): SessionBadge => {
      const sessionAgentIds = Object.entries(participants)
        .filter(
          ([, participant]) =>
            participant.kind === "agent" &&
            participant.active_session === session.id,
        )
        .map(([id]) => id);
      const managedById = new Map(
        managedAgents.map((agent) => [agent.participant_id, agent]),
      );
      if (
        sessionAgentIds.some((id) => {
          const agent = managedById.get(id);
          return agent?.alive === true;
        })
      ) {
        return "working";
      }
      const isCurrent =
        session.id === currentSessionId &&
        (session.path === undefined ||
          activePath === null ||
          session.path === activePath);
      if (isCurrent && events.length > 0) {
        const lastSeen = lastSeenBySession[session.id];
        const latest = events[events.length - 1]?.filename;
        if (latest !== undefined && (lastSeen === undefined || latest > lastSeen)) {
          return "done unread";
        }
      }
      return "done read";
    },
    [
      activePath,
      currentSessionId,
      events,
      lastSeenBySession,
      managedAgents,
      participants,
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

    return [...byRepo.values()].map((repo) => ({
      ...repo,
      sessions: orderedSessions(repo.sessions, sessionOrderByRepo[repo.key]),
    })).sort((a, b) => {
      if (a.path === activePath && b.path !== activePath) return -1;
      if (b.path === activePath && a.path !== activePath) return 1;
      return b.latest.localeCompare(a.latest);
    });
  }, [allSessions, activePath, query, sessionOrderByRepo]);

  const moveSessionInRepo = useCallback(
    (repoKey: string, fromId: string, toId: string): void => {
      if (fromId === toId) return;
      const repo = repoGroups.find((group) => group.key === repoKey);
      if (repo === undefined) return;
      const currentOrder = repo.sessions.map((session) => session.id);
      const from = currentOrder.indexOf(fromId);
      const to = currentOrder.indexOf(toId);
      if (from < 0 || to < 0) return;
      const nextOrder = currentOrder.slice();
      const [moved] = nextOrder.splice(from, 1);
      if (moved === undefined) return;
      nextOrder.splice(to, 0, moved);
      const next = { ...sessionOrderByRepo, [repoKey]: nextOrder };
      saveSessionOrderByRepo(next);
      setSessionOrderByRepo(next);
    },
    [repoGroups, sessionOrderByRepo],
  );

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
                    {repo.path !== null ? (
                      <InlineNewSession
                        path={repo.path}
                        expanded={expandedNewPath === repo.path}
                        onExpand={() => setExpandedNewPath(repo.path)}
                        onCollapse={() =>
                          setExpandedNewPath((cur) =>
                            cur === repo.path ? null : cur,
                          )
                        }
                        onCreated={(created) => {
                          const withPath = withFallbackPath(created, repo.path);
                          setAllSessions((prev) =>
                            sortSessions([withPath, ...prev]),
                          );
                          refreshAllSessions();
                          void selectSession(withPath);
                        }}
                        token={token}
                      />
                    ) : null}
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
                            const badge = sessionBadge(s);
                            const renaming = renamingSessionId === s.id;
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
                                  draggingSessionId === s.id ? "dragging" : "",
                                ]
                                  .join(" ")
                                  .trim()}
                                style={{ ["--i" as string]: i }}
                                draggable={!renaming}
                                onClick={() => {
                                  if (!renaming) void selectSession(s);
                                }}
                                onDoubleClick={(e) => {
                                  e.preventDefault();
                                  beginRename(s);
                                }}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  setContextMenu({
                                    x: e.clientX,
                                    y: e.clientY,
                                    session: s,
                                  });
                                }}
                                onDragStart={(e) => {
                                  setDraggingSessionId(s.id);
                                  e.dataTransfer.effectAllowed = "move";
                                  e.dataTransfer.setData("text/plain", s.id);
                                }}
                                onDragOver={(e) => {
                                  if (draggingSessionId === null) return;
                                  e.preventDefault();
                                  e.dataTransfer.dropEffect = "move";
                                }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  const fromId =
                                    e.dataTransfer.getData("text/plain") ||
                                    draggingSessionId;
                                  if (fromId !== null) {
                                    moveSessionInRepo(repo.key, fromId, s.id);
                                  }
                                  setDraggingSessionId(null);
                                }}
                                onDragEnd={() => setDraggingSessionId(null)}
                                onKeyDown={(e) => {
                                  if (renaming) return;
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    void selectSession(s);
                                  } else if (e.key === "F2") {
                                    e.preventDefault();
                                    beginRename(s);
                                  }
                                }}
                                aria-pressed={active}
                                aria-busy={switching}
                              >
                                <div className="row1">
                                  <span
                                    className={[
                                      "status-dot",
                                      badge.includes("unread")
                                        ? "unread"
                                        : active
                                          ? "active"
                                          : "idle",
                                    ].join(" ")}
                                    aria-hidden="true"
                                  />
                                  {renaming ? (
                                    <span
                                      className="session-rename"
                                      onClick={(e) => e.stopPropagation()}
                                      onDoubleClick={(e) => e.stopPropagation()}
                                    >
                                      <input
                                        value={renameValue}
                                        aria-label={`Rename ${s.slug}`}
                                        autoFocus
                                        onChange={(e) =>
                                          setRenameValue(
                                            e.target.value
                                              .toLowerCase()
                                              .replace(/[^a-z0-9-]/g, ""),
                                          )
                                        }
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            e.preventDefault();
                                            void saveRename(s);
                                          } else if (e.key === "Escape") {
                                            e.preventDefault();
                                            cancelRename();
                                          }
                                        }}
                                      />
                                      <button
                                        type="button"
                                        className="session-row-action"
                                        aria-label="Save session name"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          void saveRename(s);
                                        }}
                                      >
                                        <Check size={13} aria-hidden />
                                      </button>
                                      <button
                                        type="button"
                                        className="session-row-action"
                                        aria-label="Cancel rename"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          cancelRename();
                                        }}
                                      >
                                        <X size={13} aria-hidden />
                                      </button>
                                    </span>
                                  ) : (
                                    <span className="slug">{s.slug}</span>
                                  )}
                                  <button
                                    type="button"
                                    className="session-row-action"
                                    onClick={(e) => openFork(e, s)}
                                    onKeyDown={(e) => e.stopPropagation()}
                                    aria-label={`Fork ${s.slug}`}
                                    title="Fork session"
                                  >
                                    <GitFork size={13} aria-hidden />
                                  </button>
                                  <button
                                    type="button"
                                    className="session-row-action"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setContextMenu({
                                        x: e.clientX,
                                        y: e.clientY,
                                        session: s,
                                      });
                                    }}
                                    onKeyDown={(e) => e.stopPropagation()}
                                    aria-label={`Session actions for ${s.slug}`}
                                    title="Session actions"
                                  >
                                    <MoreVertical size={13} aria-hidden />
                                  </button>
                                </div>
                                <div className="meta">
                                  <span>{formatRelative(s.created_at, now)}</span>
                                  <span className={`session-state-badge ${badge.replaceAll(" ", "-")}`}>
                                    {badge}
                                  </span>
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
      {forkTarget !== null ? (
        <ForkSessionPopover
          anchorRect={forkAnchorRect}
          target={forkTarget}
          onClose={closeFork}
          onForked={handleForked}
        />
      ) : null}
      {contextMenu !== null ? (
        <div
          className="session-context-menu"
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseLeave={() => setContextMenu(null)}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => void selectSession(contextMenu.session)}
          >
            <Search size={13} aria-hidden />
            Focus
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => beginRename(contextMenu.session)}
          >
            <Pencil size={13} aria-hidden />
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              setForkAnchorRect(e.currentTarget.getBoundingClientRect());
              setForkTarget(contextMenu.session);
              setContextMenu(null);
            }}
          >
            <GitFork size={13} aria-hidden />
            Fork
          </button>
          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={() => void deleteSession(contextMenu.session)}
          >
            <Trash2 size={13} aria-hidden />
            Delete
          </button>
        </div>
      ) : null}
    </aside>
  );
}

interface InlineNewSessionProps {
  path: string;
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onCreated: (session: SessionMeta) => void;
  token: string | null;
}

function InlineNewSession(props: InlineNewSessionProps): JSX.Element {
  const { path, expanded, onExpand, onCollapse, onCreated, token } = props;
  const [slug, setSlug] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (expanded) {
      inputRef.current?.focus();
    } else {
      setSlug("");
      setError(null);
    }
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    function onDown(e: globalThis.MouseEvent): void {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        onCollapse();
      }
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [expanded, onCollapse]);

  const slugValid = SLUG_RE.test(slug);
  const canSubmit = slugValid && !submitting;

  async function submit(): Promise<void> {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const client = createClient({ baseUrl: "", token });
      const session = await client.createSession({ slug, path });
      onCreated(session);
      onCollapse();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create session");
    } finally {
      setSubmitting(false);
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        className="inline-new-session"
        onClick={onExpand}
        aria-label={`New session in ${basename(path)}`}
      >
        <Plus
          size={12}
          aria-hidden="true"
          className="inline-new-session-icon"
        />
        <span>New session</span>
      </button>
    );
  }

  return (
    <div ref={rootRef} className="inline-new-session expanded">
      <div className="inline-new-session-row">
        <input
          ref={inputRef}
          className="inline-new-session-input"
          placeholder="name"
          value={slug}
          aria-label={`New session name in ${basename(path)}`}
          onChange={(e) => {
            const raw = e.target.value
              .toLowerCase()
              .replace(/[^a-z0-9-]/g, "");
            setSlug(raw);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCollapse();
            }
          }}
        />
        <button
          type="button"
          className="inline-new-session-start"
          disabled={!canSubmit}
          onClick={() => void submit()}
        >
          {submitting ? "…" : "Start"}
        </button>
      </div>
      {error !== null ? (
        <div className="inline-new-session-error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
