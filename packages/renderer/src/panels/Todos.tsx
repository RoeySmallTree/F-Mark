import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { createClient } from "../api/client.js";
import type { TodoBuckets } from "../api/client.js";
import { useStore } from "../state/store.js";

const EMPTY_BUCKETS: TodoBuckets = { open: [], wip: [], done: [] };

export function Todos(): JSX.Element {
  const sessions = useStore((s) => s.sessions);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const token = useStore((s) => s.token);
  const events = useStore((s) => s.events);
  const [buckets, setBuckets] = useState<TodoBuckets>(EMPTY_BUCKETS);
  const [loadError, setLoadError] = useState<string | null>(null);

  const slug = useMemo(
    () =>
      sessions.find((s) => s.id === currentSessionId)?.slug ?? "no session",
    [sessions, currentSessionId],
  );

  useEffect(() => {
    if (currentSessionId === null) {
      setBuckets(EMPTY_BUCKETS);
      return;
    }
    let cancelled = false;
    const client = createClient({ baseUrl: "", token });
    void (async () => {
      try {
        const next = await client.listTodos(currentSessionId);
        if (!cancelled) {
          setBuckets(next);
          setLoadError(null);
        }
      } catch (err) {
        // Endpoint may not yet exist on a running kernel — fall back to empty.
        if (!cancelled) {
          setBuckets(EMPTY_BUCKETS);
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentSessionId, token, events.length]);

  return (
    <aside
      className="left-panel"
      role="tabpanel"
      aria-label="Todos panel"
    >
      <div
        className="panel-head"
        style={{
          flexDirection: "column",
          alignItems: "stretch",
          gap: 0,
          paddingBottom: 4,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h3>TODOS</h3>
          <button
            type="button"
            className="new-btn"
            title="Coming in P10"
            disabled
          >
            <Plus size={10} style={{ marginRight: 3, verticalAlign: -1 }} />
            ADD
          </button>
        </div>
        <div className="scope">
          in <b>{slug}</b>
        </div>
      </div>
      <div className="panel-list" style={{ padding: "0 14px 12px" }}>
        {(["open", "wip", "done"] as const).map((status) => {
          const items = buckets[status];
          return (
            <div key={status}>
              <div
                className="group-label"
                style={{ padding: "10px 0 4px" }}
              >
                {status.toUpperCase()} ({items.length})
              </div>
              {items.length === 0 ? (
                <p
                  style={{
                    fontFamily: "var(--serif)",
                    fontStyle: "italic",
                    color: "var(--ink-4)",
                    fontSize: 12.5,
                    margin: "2px 0 6px",
                  }}
                >
                  {status === "open"
                    ? "No open todos."
                    : status === "wip"
                      ? "Nothing in progress."
                      : "Nothing done yet."}
                </p>
              ) : (
                items.map((t) => (
                  <div
                    key={t.id}
                    className={["session-item"].join(" ").trim()}
                    style={{ padding: "8px 8px" }}
                  >
                    <div className="row1">
                      <span
                        className={[
                          "status-dot",
                          status === "done" ? "active" : "idle",
                        ].join(" ")}
                        aria-hidden="true"
                      />
                      <span className="slug">{t.title}</span>
                    </div>
                    {t.assigned_to !== undefined ? (
                      <div className="meta">
                        <span>assigned to {t.assigned_to}</span>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          );
        })}
        {loadError !== null ? (
          <p
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10.5,
              color: "var(--ink-4)",
              marginTop: 10,
              padding: "0 4px",
            }}
            title={loadError}
          >
            (kernel endpoint not yet available)
          </p>
        ) : null}
      </div>
    </aside>
  );
}
