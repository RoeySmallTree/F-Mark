import { useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
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

export function Sessions(): JSX.Element {
  const sessions = useStore((s) => s.sessions);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const setCurrentSession = useStore((s) => s.setCurrentSession);
  const setSessions = useStore((s) => s.setSessions);
  const openModal = useStore((s) => s.openModal);
  const token = useStore((s) => s.token);
  const [query, setQuery] = useState("");

  // Re-fetch sessions on WS event (new session/event)
  useEffect(() => {
    const client = createClient({ baseUrl: "", token });
    let cancelled = false;
    const refresh = (): void => {
      void client.listSessions().then((list) => {
        if (!cancelled) setSessions(list);
      });
    };
    refresh();
    const ws = connectWs({ baseUrl: "", token }, (msg) => {
      // Any event_added or new session may change ordering — re-fetch.
      if (msg.type === "event_added") refresh();
    });
    return () => {
      cancelled = true;
      ws.close();
    };
  }, [token, setSessions]);

  const now = useMemo(() => new Date(), [sessions.length]);
  const groups = useMemo(() => {
    const filtered = sessions.filter((s) =>
      query.trim().length === 0
        ? true
        : s.slug.toLowerCase().includes(query.toLowerCase().trim()),
    );
    const map = new Map<GroupKey, SessionMeta[]>();
    for (const key of GROUP_ORDER) map.set(key, []);
    for (const s of filtered) {
      const g = groupFor(s.created_at, now);
      map.get(g)!.push(s);
    }
    return map;
  }, [sessions, now, query]);

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
        {sessions.length === 0 ? (
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
        ) : (
          (() => {
            let staggerIdx = -1;
            return GROUP_ORDER.map((key) => {
              const items = groups.get(key) ?? [];
              if (items.length === 0) return null;
              return (
                <div key={key}>
                  <div className="group-label">{key.toUpperCase()}</div>
                  {items.map((s) => {
                    const active = s.id === currentSessionId;
                    staggerIdx += 1;
                    const i = Math.min(staggerIdx, 5);
                    return (
                      <div
                        key={s.id}
                        role="button"
                        tabIndex={0}
                        className={[
                          "session-item",
                          "staggered-row",
                          active ? "active" : "",
                        ]
                          .join(" ")
                          .trim()}
                        style={{ ["--i" as string]: i }}
                        onClick={() => setCurrentSession(s.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setCurrentSession(s.id);
                          }
                        }}
                        aria-pressed={active}
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
            });
          })()
        )}
      </div>
    </aside>
  );
}
